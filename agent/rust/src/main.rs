mod policy;
mod protocol;
mod spool;

use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::{SecondsFormat, Utc};
use policy::{evaluate as evaluate_policy, PolicyBundle, PolicyDecision};
use protocol::{
    provider_id, read_message, validate_file_start, write_message, AgentMessage, Inspection,
    SecurityEvent, CHUNK_SIZE, MAX_FILE_SIZE,
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::io::{stdin, stdout, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use uuid::Uuid;
use wait_timeout::ChildExt;
use zeroize::Zeroize;

const MAX_MESSAGE_BYTES: usize = 512 * 1024;
const MAX_FINDING_CATEGORIES: usize = 50;

struct PendingFile {
    file_id: String,
    provider_domain: String,
    file_name: String,
    mime_type: String,
    size_bytes: u64,
    total_chunks: usize,
    next_chunk: usize,
    bytes: Vec<u8>,
}

impl Drop for PendingFile {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

#[derive(Debug, Deserialize)]
struct ScanOutput {
    #[serde(default)]
    complete: bool,
    #[serde(default)]
    risk_score: u8,
    #[serde(default)]
    severity: String,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    redacted_preview: Option<String>,
}

fn setting(name: &str) -> Option<String> {
    if let Ok(value) = std::env::var(name) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }

    let key = match name {
        "AEGIS_EXTENSION_ORIGINS" => "extension_origins",
        "AEGIS_CONTROL_PLANE_URL" => "control_plane_url",
        "AEGIS_AGENT_TOKEN" => "agent_token",
        "AEGIS_PYTHON" => "python",
        "AEGIS_ENGINE_PATH" => "engine_path",
        _ => return None,
    };
    let config_path = dirs::config_dir()?.join("AegisAI").join("config.json");
    let raw = std::fs::read(config_path).ok()?;
    let config: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    config
        .get(key)?
        .as_str()
        .map(str::to_owned)
        .filter(|value| !value.trim().is_empty())
}

fn python_executable() -> String {
    if let Some(value) = setting("AEGIS_PYTHON") {
        return value;
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            #[cfg(target_os = "windows")]
            let candidate = directory.join(".venv").join("Scripts").join("python.exe");
            #[cfg(not(target_os = "windows"))]
            let candidate = directory.join(".venv").join("bin").join("python");
            if candidate.is_file() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }
    if cfg!(target_os = "windows") {
        "python".into()
    } else {
        "python3".into()
    }
}

fn allowed_origin(args: &[String]) -> bool {
    if std::env::var("AEGIS_ALLOW_UNVERIFIED_ORIGIN").as_deref() == Ok("1") {
        return true;
    }
    if let Some(origin) = args.first() {
        if origin.starts_with("chrome-extension://") {
            let configured = setting("AEGIS_EXTENSION_ORIGINS").unwrap_or_default();
            return configured
                .split(',')
                .map(str::trim)
                .any(|item| !item.is_empty() && item == origin);
        }
    }
    let firefox_id_matches = args.get(1).map(String::as_str) == Some("aegisai@example.invalid");
    let expected_manifest = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("AegisAI")
        .join("com.aegisai.agent.json");
    let manifest_matches = args
        .first()
        .and_then(|path| PathBuf::from(path).canonicalize().ok())
        .zip(expected_manifest.canonicalize().ok())
        .map(|(provided, expected)| provided == expected)
        .unwrap_or(false);
    firefox_id_matches && manifest_matches
}

fn device_id() -> Result<String> {
    let base = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("AegisAI");
    std::fs::create_dir_all(&base)?;
    let path = base.join("device-id");
    if path.exists() {
        return Ok(std::fs::read_to_string(path)?.trim().to_owned());
    }
    let id = Uuid::new_v4().to_string();
    std::fs::write(&path, &id)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(id)
}

fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "unknown"
    }
}

fn failed_inspection() -> Inspection {
    Inspection {
        status: "failed".into(),
        risk_score: 0,
        severity: "none".into(),
        categories: vec![],
        redacted_preview: None,
    }
}

fn scan_local_file(filename: &str, bytes: &[u8]) -> Result<Inspection> {
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(anyhow!("file exceeds inspection size limit"));
    }

    let executable = python_executable();
    let engine_path = match setting("AEGIS_ENGINE_PATH") {
        Some(value) => PathBuf::from(value),
        None => std::env::current_exe()?
            .parent()
            .ok_or_else(|| anyhow!("agent executable directory unavailable"))?
            .join("engine"),
    };

    let mut child = Command::new(executable)
        .arg("-m")
        .arg("aegis_inspector.cli")
        .arg("--stdin-file")
        .arg(format!("--filename={filename}"))
        .current_dir(engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("local Python inspector could not start")?;

    let mut child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("inspector stdin unavailable"))?;
    child_stdin
        .write_all(bytes)
        .context("could not stream file to local inspector")?;
    drop(child_stdin);

    if child
        .wait_timeout(std::time::Duration::from_secs(30))
        .context("could not wait for local inspector")?
        .is_none()
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(anyhow!("local inspection timed out"));
    }
    let output = child.wait_with_output().context("local inspector failed")?;
    let report: ScanOutput = serde_json::from_slice(&output.stdout)
        .context("local inspector returned invalid report")?;

    let mut categories = report.categories;
    categories.retain(|item| !item.trim().is_empty() && item.len() <= 64);
    categories.sort();
    categories.dedup();
    categories.truncate(MAX_FINDING_CATEGORIES);

    let severity = match report.severity.as_str() {
        "low" | "medium" | "high" | "critical" => report.severity,
        _ => "none".into(),
    };

    Ok(Inspection {
        status: if report.complete {
            "completed"
        } else {
            "failed"
        }
        .into(),
        risk_score: report.risk_score.min(100),
        severity,
        categories,
        redacted_preview: report
            .redacted_preview
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.chars().take(4000).collect()),
    })
}

fn build_event(
    file: &PendingFile,
    inspection: Inspection,
    decision: &PolicyDecision,
) -> Result<SecurityEvent> {
    let hostname = hostname::get()?.to_string_lossy().to_string();
    let username = whoami::username();
    let extension = PathBuf::from(&file.file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .chars()
        .take(32)
        .collect::<String>()
        .to_ascii_lowercase();
    let provider =
        provider_id(&file.provider_domain).ok_or_else(|| anyhow!("unsupported provider"))?;
    let redacted_preview = if decision.share_redacted_preview {
        inspection.redacted_preview.clone()
    } else {
        None
    };

    Ok(SecurityEvent {
        event_id: Uuid::new_v4().to_string(),
        occurred_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        actor: protocol::Actor {
            user_id: None,
            username,
            identity_source: "local_os_account".into(),
        },
        device: protocol::Device {
            device_id: device_id()?,
            hostname,
            os: os_name().into(),
        },
        provider: provider.into(),
        provider_domain: file.provider_domain.clone(),
        event_type: if inspection.status == "completed" {
            "inspection_completed".into()
        } else {
            "unknown".into()
        },
        file: protocol::FileMetadata {
            name: file.file_name.clone(),
            extension,
            mime_type: file.mime_type.clone(),
            size_bytes: file.size_bytes,
        },
        inspection,
        outcome: "observed".into(),
        enforcement: protocol::Enforcement {
            confirmed: false,
            component: "none".into(),
        },
        policy_id: decision.policy_id.clone(),
        policy_name: decision.policy_name.clone(),
        policy_action: Some(decision.action.clone()),
        redacted_preview,
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn fetch_policy_bundle() -> Result<Option<PolicyBundle>> {
    let base = match setting("AEGIS_CONTROL_PLANE_URL") {
        Some(value) => value.trim_end_matches('/').to_owned(),
        None => return Ok(None),
    };
    let token = setting("AEGIS_AGENT_TOKEN").ok_or_else(|| {
        anyhow!("device token is missing while remote policy service is configured")
    })?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let response = client
        .get(format!("{base}/api/v1/agent/policies"))
        .bearer_auth(token)
        .send()?
        .error_for_status()?;
    let bundle = response.json::<PolicyBundle>()?;
    Ok(Some(bundle))
}

fn unavailable_policy_decision() -> PolicyDecision {
    PolicyDecision {
        action: "block".into(),
        policy_id: None,
        policy_name: None,
        reason: "policy_service_unavailable".into(),
        share_redacted_preview: false,
    }
}

struct PendingResult {
    file_id: String,
    event: SecurityEvent,
    decision: PolicyDecision,
}

fn forward_event(event: &SecurityEvent) -> &'static str {
    let base = match setting("AEGIS_CONTROL_PLANE_URL") {
        Some(value) => value.trim_end_matches('/').to_owned(),
        None => return "not_configured",
    };
    let token = match setting("AEGIS_AGENT_TOKEN") {
        Some(value) => value,
        None => return "not_configured",
    };
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
    {
        Ok(value) => value,
        Err(_) => return "delivery_failed",
    };
    match client
        .post(format!("{base}/api/v1/events"))
        .bearer_auth(token)
        .json(event)
        .send()
    {
        Ok(response) if response.status().is_success() => "delivered",
        _ => "delivery_failed",
    }
}

fn handle_message(
    message: AgentMessage,
    pending: &mut Option<PendingFile>,
    completed: &mut Option<PendingResult>,
) -> Result<serde_json::Value> {
    match message {
        AgentMessage::FileStart {
            file_id,
            provider_domain,
            file_name,
            mime_type,
            size_bytes,
            total_chunks,
        } => {
            if pending.is_some() || completed.is_some() {
                return Err(anyhow!("another file transfer is already active"));
            }
            validate_file_start(
                &file_id,
                &provider_domain,
                &file_name,
                &mime_type,
                size_bytes,
                total_chunks,
            )?;
            *pending = Some(PendingFile {
                file_id,
                provider_domain,
                file_name,
                mime_type,
                size_bytes,
                total_chunks,
                next_chunk: 0,
                bytes: Vec::with_capacity(size_bytes as usize),
            });
            Ok(json!({"type":"ack","stage":"file_started"}))
        }
        AgentMessage::FileChunk {
            file_id,
            index,
            mut data_base64,
        } => {
            let decoded_result = STANDARD.decode(data_base64.as_bytes());
            data_base64.zeroize();
            let mut decoded = decoded_result.context("invalid file chunk encoding")?;
            let transfer = match pending.as_mut() {
                Some(value) => value,
                None => {
                    decoded.zeroize();
                    return Err(anyhow!("no active file transfer"));
                }
            };
            if transfer.file_id != file_id || index != transfer.next_chunk {
                decoded.zeroize();
                return Err(anyhow!("file chunk sequence mismatch"));
            }
            let remaining = transfer.size_bytes as usize - transfer.bytes.len();
            let expected = remaining.min(CHUNK_SIZE);
            if decoded.len() != expected {
                decoded.zeroize();
                return Err(anyhow!("file chunk size mismatch"));
            }
            transfer.bytes.extend_from_slice(&decoded);
            decoded.zeroize();
            transfer.next_chunk += 1;
            Ok(json!({"type":"ack","stage":"chunk_received","index":index}))
        }
        AgentMessage::FileEnd { file_id } => {
            let transfer = pending
                .take()
                .ok_or_else(|| anyhow!("no active file transfer"))?;
            if transfer.file_id != file_id
                || transfer.next_chunk != transfer.total_chunks
                || transfer.bytes.len() as u64 != transfer.size_bytes
            {
                return Err(anyhow!("file transfer is incomplete"));
            }

            let inspection = match scan_local_file(&transfer.file_name, &transfer.bytes) {
                Ok(value) => value,
                Err(_) => failed_inspection(),
            };
            let provider = provider_id(&transfer.provider_domain)
                .ok_or_else(|| anyhow!("unsupported provider"))?;
            let extension = PathBuf::from(&transfer.file_name)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let fingerprint = sha256_hex(&transfer.bytes);
            let decision = match fetch_policy_bundle() {
                Ok(Some(bundle)) => evaluate_policy(
                    &bundle,
                    provider,
                    &extension,
                    &fingerprint,
                    inspection.status == "completed",
                    &inspection.severity,
                    inspection.risk_score,
                    &inspection.categories,
                ),
                Ok(None) => PolicyDecision {
                    action: "allow".into(),
                    policy_id: None,
                    policy_name: None,
                    reason: "local_only_no_remote_policy".into(),
                    share_redacted_preview: false,
                },
                Err(_) => unavailable_policy_decision(),
            };
            let event = build_event(&transfer, inspection, &decision)?;
            let pending_result = PendingResult {
                file_id: transfer.file_id.clone(),
                event,
                decision: decision.clone(),
            };
            drop(transfer);
            *completed = Some(pending_result);
            Ok(json!({
                "type": "inspection_result",
                "event_id": completed.as_ref().map(|item| item.event.event_id.clone()),
                "inspection": completed.as_ref().map(|item| &item.event.inspection),
                "decision": decision,
                "requires_enforcement_ack": true
            }))
        }
        AgentMessage::EnforcementResult { file_id, blocked } => {
            let mut result = completed
                .take()
                .ok_or_else(|| anyhow!("no completed inspection is awaiting enforcement"))?;
            if result.file_id != file_id {
                *completed = Some(result);
                return Err(anyhow!("enforcement result file identifier mismatch"));
            }
            if blocked && result.decision.action != "block" {
                *completed = Some(result);
                return Err(anyhow!("browser reported a block for a non-block decision"));
            }
            if !blocked && result.decision.action == "block" {
                *completed = Some(result);
                return Err(anyhow!(
                    "browser cannot continue an upload that policy blocked"
                ));
            }
            if blocked {
                result.event.event_type = "upload_prevented".into();
                result.event.outcome = "prevented".into();
                result.event.enforcement = protocol::Enforcement {
                    confirmed: true,
                    component: "browser".into(),
                };
            }
            let event_json = serde_json::to_value(&result.event)?;
            spool::append(&event_json)?;
            let remote_delivery = forward_event(&result.event);
            Ok(json!({
                "type": "enforcement_recorded",
                "event_id": result.event.event_id,
                "outcome": result.event.outcome,
                "remote_delivery": remote_delivery
            }))
        }
    }
}

fn run() -> Result<()> {
    let host_args = std::env::args().skip(1).collect::<Vec<_>>();
    if !allowed_origin(&host_args) {
        return Err(anyhow!("Native Messaging origin is not allowlisted"));
    }

    let input = stdin();
    let output = stdout();
    let mut reader = input.lock();
    let mut writer = output.lock();
    let mut pending: Option<PendingFile> = None;
    let mut completed: Option<PendingResult> = None;

    loop {
        let mut frame = match read_message(&mut reader, MAX_MESSAGE_BYTES)? {
            Some(value) => value,
            None => break,
        };
        let parsed = serde_json::from_slice::<AgentMessage>(&frame)
            .context("invalid Native Messaging message");
        let response = match parsed {
            Ok(message) => match handle_message(message, &mut pending, &mut completed) {
                Ok(value) => value,
                Err(_) => {
                    pending = None;
                    completed = None;
                    json!({"type":"error","code":"inspection_message_rejected"})
                }
            },
            Err(_) => {
                pending = None;
                completed = None;
                json!({"type":"error","code":"inspection_message_rejected"})
            }
        };
        frame.zeroize();
        write_message(&mut writer, &response)?;
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("AegisAI agent startup error: {error:#}");
        std::process::exit(1);
    }
}
