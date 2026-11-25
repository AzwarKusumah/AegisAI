mod protocol;
mod spool;

use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::{SecondsFormat, Utc};
use protocol::{
    provider_id, read_message, validate_file_start, write_message, AgentMessage, Inspection,
    SecurityEvent, CHUNK_SIZE, MAX_FILE_SIZE,
};
use serde::Deserialize;
use serde_json::json;
use std::io::{stdin, stdout, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use uuid::Uuid;
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
    findings: Vec<ScanFinding>,
}

#[derive(Debug, Deserialize)]
struct ScanFinding {
    category: String,
    severity: String,
}

fn allowed_origin(args: &[String]) -> bool {
    if std::env::var("AEGIS_ALLOW_UNVERIFIED_ORIGIN").as_deref() == Ok("1") {
        return true;
    }
    if let Some(origin) = args.first() {
        if origin.starts_with("chrome-extension://") {
            let configured = std::env::var("AEGIS_EXTENSION_ORIGINS").unwrap_or_default();
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
    }
}

fn scan_local_file(filename: &str, bytes: &[u8]) -> Result<Inspection> {
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(anyhow!("file exceeds inspection size limit"));
    }

    let executable = std::env::var("AEGIS_PYTHON").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "python".into()
        } else {
            "python3".into()
        }
    });
    let engine_path = match std::env::var("AEGIS_ENGINE_PATH") {
        Ok(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => std::env::current_exe()?
            .parent()
            .ok_or_else(|| anyhow!("agent executable directory unavailable"))?
            .join("engine"),
    };

    let mut child = Command::new(executable)
        .arg("-m")
        .arg("aegis_inspector.cli")
        .arg("--stdin-file")
        .arg("--filename")
        .arg(filename)
        .current_dir(engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("local Python inspector could not start")?;

    let mut child_stdin = child.stdin.take().ok_or_else(|| anyhow!("inspector stdin unavailable"))?;
    child_stdin.write_all(bytes).context("could not stream file to local inspector")?;
    drop(child_stdin);

    let output = child.wait_with_output().context("local inspector failed")?;
    let report: ScanOutput = serde_json::from_slice(&output.stdout)
        .context("local inspector returned invalid report")?;

    let mut categories = report
        .findings
        .iter()
        .map(|item| item.category.trim().to_owned())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    categories.sort();
    categories.dedup();
    categories.truncate(MAX_FINDING_CATEGORIES);

    let severity = report
        .findings
        .iter()
        .map(|item| item.severity.as_str())
        .max_by_key(|severity| match *severity {
            "critical" => 5,
            "high" => 4,
            "medium" => 3,
            "low" => 2,
            _ => 1,
        })
        .unwrap_or("none")
        .to_owned();

    Ok(Inspection {
        status: if report.complete { "completed" } else { "failed" }.into(),
        risk_score: report.risk_score.min(100),
        severity,
        categories,
    })
}

fn build_event(file: &PendingFile, inspection: Inspection) -> Result<SecurityEvent> {
    let hostname = hostname::get()?.to_string_lossy().to_string();
    let username = whoami::username();
    let extension = PathBuf::from(&file.file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .chars()
        .take(32)
        .collect();
    let provider = provider_id(&file.provider_domain)
        .ok_or_else(|| anyhow!("unsupported provider"))?;

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
    })
}

fn forward_event(event: &SecurityEvent) -> &'static str {
    let base = match std::env::var("AEGIS_CONTROL_PLANE_URL") {
        Ok(value) if !value.trim().is_empty() => value.trim_end_matches('/').to_owned(),
        _ => return "not_configured",
    };
    let token = match std::env::var("AEGIS_AGENT_TOKEN") {
        Ok(value) if !value.is_empty() => value,
        _ => return "not_configured",
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

fn handle_message(message: AgentMessage, pending: &mut Option<PendingFile>) -> Result<serde_json::Value> {
    match message {
        AgentMessage::FileStart {
            file_id,
            provider_domain,
            file_name,
            mime_type,
            size_bytes,
            total_chunks,
        } => {
            if pending.is_some() {
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
            let transfer = pending.take().ok_or_else(|| anyhow!("no active file transfer"))?;
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
            let event = build_event(&transfer, inspection)?;
            let event_json = serde_json::to_value(&event)?;
            spool::append(&event_json)?;
            let remote_delivery = forward_event(&event);
            Ok(json!({
                "type": "inspection_result",
                "event_id": event.event_id,
                "event_type": event.event_type,
                "inspection": event.inspection,
                "outcome": event.outcome,
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

    loop {
        let mut frame = match read_message(&mut reader, MAX_MESSAGE_BYTES)? {
            Some(value) => value,
            None => break,
        };
        let parsed = serde_json::from_slice::<AgentMessage>(&frame)
            .context("invalid Native Messaging message");
        let response = match parsed {
            Ok(message) => match handle_message(message, &mut pending) {
                Ok(value) => value,
                Err(_) => {
                    pending = None;
                    json!({"type":"error","code":"inspection_message_rejected"})
                }
            },
            Err(_) => {
                pending = None;
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
