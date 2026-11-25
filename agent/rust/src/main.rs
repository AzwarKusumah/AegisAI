mod protocol;
mod spool;

use anyhow::{anyhow, Context, Result};
use chrono::{SecondsFormat, Utc};
use protocol::{read_message, write_message, BrowserObservation, SecurityEvent};
use serde_json::json;
use std::io::{stdin, stdout};
use std::path::PathBuf;
use uuid::Uuid;

const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

fn allowed_origin(origin: &str) -> bool {
    if std::env::var("AEGIS_ALLOW_UNVERIFIED_ORIGIN").as_deref() == Ok("1") { return true; }
    let configured = std::env::var("AEGIS_EXTENSION_ORIGINS").unwrap_or_default();
    configured.split(',').map(str::trim).any(|item| !item.is_empty() && item == origin)
}

fn device_id() -> Result<String> {
    let base = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join("AegisAI");
    std::fs::create_dir_all(&base)?;
    let path = base.join("device-id");
    if path.exists() { return Ok(std::fs::read_to_string(path)?.trim().to_owned()); }
    let id = Uuid::new_v4().to_string();
    std::fs::write(&path, &id)?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(id)
}

fn os_name() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "linux") { "linux" }
    else if cfg!(target_os = "macos") { "macos" }
    else { "unknown" }
}

fn build_event(observation: BrowserObservation) -> Result<SecurityEvent> {
    observation.validate()?;
    let hostname = hostname::get()?.to_string_lossy().to_string();
    let username = whoami::username();
    let file_name = PathBuf::from(&observation.file.name)
        .file_name().and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("invalid file basename"))?
        .chars().take(255).collect::<String>();
    if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
        return Err(anyhow!("invalid file basename"));
    }
    let extension = PathBuf::from(&file_name).extension()
        .and_then(|value| value.to_str()).unwrap_or("").chars().take(32).collect();

    Ok(SecurityEvent {
        event_id: Uuid::new_v4().to_string(),
        occurred_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        actor: protocol::Actor { user_id: None, username, identity_source: "local_os_account".into() },
        device: protocol::Device { device_id: device_id()?, hostname, os: os_name().into() },
        provider: observation.provider,
        provider_domain: observation.provider_domain,
        event_type: "attachment_selected".into(),
        file: protocol::FileMetadata {
            name: file_name, extension,
            mime_type: observation.file.mime_type.chars().take(127).collect(),
            size_bytes: observation.file.size_bytes,
        },
        inspection: protocol::Inspection {
            status: "not_inspected".into(), risk_score: 0, severity: "none".into(), categories: vec![],
        },
        outcome: "observed".into(),
        enforcement: protocol::Enforcement { confirmed: false, component: "none".into() },
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
        .timeout(std::time::Duration::from_secs(4)).build() {
        Ok(value) => value, Err(_) => return "delivery_failed",
    };
    match client.post(format!("{base}/api/v1/events")).bearer_auth(token).json(event).send() {
        Ok(response) if response.status().is_success() => "delivered",
        _ => "delivery_failed",
    }
}

fn run() -> Result<()> {
    let origin = std::env::args().nth(1).unwrap_or_default();
    if !allowed_origin(&origin) { return Err(anyhow!("Native Messaging origin is not allowlisted")); }
    let input = stdin();
    let output = stdout();
    let mut reader = input.lock();
    let mut writer = output.lock();

    loop {
        let message = match read_message(&mut reader, MAX_MESSAGE_BYTES)? {
            Some(value) => value, None => break,
        };
        let result = (|| -> Result<serde_json::Value> {
            let observation: BrowserObservation =
                serde_json::from_slice(&message).context("invalid browser observation")?;
            let event = build_event(observation)?;
            let event_json = serde_json::to_value(&event)?;
            spool::append(&event_json)?;
            let remote_delivery = forward_event(&event);
            Ok(json!({
                "type": "ack", "event_id": event.event_id,
                "local_recorded": true, "remote_delivery": remote_delivery,
                "event_type": event.event_type
            }))
        })();
        let response = match result {
            Ok(value) => value,
            Err(error) => {
                eprintln!("AegisAI agent rejected message: {error}");
                json!({"type":"error","code":"invalid_or_unavailable","message":"Event was not accepted"})
            }
        };
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
