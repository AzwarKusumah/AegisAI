use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use uuid::Uuid;

pub const CHUNK_SIZE: usize = 256 * 1024;
pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
pub const MAX_CHUNKS: usize = 40;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum AgentMessage {
    Status,
    FileStart {
        file_id: String,
        provider_domain: String,
        file_name: String,
        mime_type: String,
        size_bytes: u64,
        total_chunks: usize,
    },
    FileChunk {
        file_id: String,
        index: usize,
        data_base64: String,
    },
    FileEnd {
        file_id: String,
    },
    EnforcementResult {
        file_id: String,
        blocked: bool,
    },
}

pub fn provider_id(domain: &str) -> Option<&'static str> {
    match domain {
        "chatgpt.com" => Some("chatgpt"),
        "claude.ai" => Some("claude"),
        "gemini.google.com" => Some("gemini"),
        "copilot.microsoft.com" => Some("copilot"),
        "perplexity.ai" => Some("perplexity"),
        "grok.com" => Some("grok"),
        _ => None,
    }
}

pub fn validate_file_start(
    file_id: &str,
    provider_domain: &str,
    file_name: &str,
    mime_type: &str,
    size_bytes: u64,
    total_chunks: usize,
) -> Result<()> {
    Uuid::parse_str(file_id).map_err(|_| anyhow!("invalid file identifier"))?;
    if provider_id(provider_domain).is_none() {
        return Err(anyhow!("unsupported provider domain"));
    }
    if file_name.trim().is_empty()
        || file_name.len() > 255
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name == "."
        || file_name == ".."
    {
        return Err(anyhow!("invalid file basename"));
    }
    if mime_type.len() > 127 {
        return Err(anyhow!("invalid MIME type"));
    }
    if size_bytes > MAX_FILE_SIZE {
        return Err(anyhow!("file exceeds inspection size limit"));
    }
    let expected_chunks = if size_bytes == 0 {
        0
    } else {
        ((size_bytes as usize) + CHUNK_SIZE - 1) / CHUNK_SIZE
    };
    if total_chunks != expected_chunks || total_chunks > MAX_CHUNKS {
        return Err(anyhow!("invalid chunk count"));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct Actor {
    pub user_id: Option<String>,
    pub username: String,
    pub identity_source: String,
}

#[derive(Debug, Serialize)]
pub struct Device {
    pub device_id: String,
    pub hostname: String,
    pub os: String,
}

#[derive(Debug, Serialize)]
pub struct FileMetadata {
    pub name: String,
    pub extension: String,
    pub mime_type: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct Inspection {
    pub status: String,
    pub risk_score: u8,
    pub severity: String,
    pub categories: Vec<String>,
    #[serde(skip)]
    pub redacted_preview: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Enforcement {
    pub confirmed: bool,
    pub component: String,
}

#[derive(Debug, Serialize)]
pub struct SecurityEvent {
    pub event_id: String,
    pub occurred_at: String,
    pub actor: Actor,
    pub device: Device,
    pub provider: String,
    pub provider_domain: String,
    pub event_type: String,
    pub file: FileMetadata,
    pub inspection: Inspection,
    pub outcome: String,
    pub enforcement: Enforcement,
    pub policy_id: Option<String>,
    pub policy_name: Option<String>,
    pub policy_action: Option<String>,
    pub redacted_preview: Option<String>,
}

pub fn read_message<R: Read>(reader: &mut R, max_bytes: usize) -> Result<Option<Vec<u8>>> {
    let mut header = [0u8; 4];
    if reader.read(&mut header[..1])? == 0 {
        return Ok(None);
    }
    reader.read_exact(&mut header[1..])?;
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > max_bytes {
        return Err(anyhow!("Native Messaging frame exceeds size limit"));
    }
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload)?;
    Ok(Some(payload))
}

pub fn write_message<W: Write>(writer: &mut W, value: &serde_json::Value) -> Result<()> {
    let payload = serde_json::to_vec(value)?;
    let length = u32::try_from(payload.len())?;
    writer.write_all(&length.to_le_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn reads_native_messaging_frame() {
        let payload = br#"{"type":"file_end","file_id":"00000000-0000-4000-8000-000000000001"}"#;
        let mut bytes = (payload.len() as u32).to_le_bytes().to_vec();
        bytes.extend_from_slice(payload);
        let mut cursor = Cursor::new(bytes);
        assert_eq!(read_message(&mut cursor, 1024).unwrap().unwrap(), payload);
    }

    #[test]
    fn rejects_oversized_frame() {
        let mut cursor = Cursor::new((2048u32).to_le_bytes().to_vec());
        assert!(read_message(&mut cursor, 1024).is_err());
    }

    #[test]
    fn validates_supported_file_start() {
        assert!(validate_file_start(
            "00000000-0000-4000-8000-000000000001",
            "chatgpt.com",
            "report.pdf",
            "application/pdf",
            10,
            1,
        )
        .is_ok());
    }

    #[test]
    fn rejects_path_like_file_name() {
        assert!(validate_file_start(
            "00000000-0000-4000-8000-000000000001",
            "chatgpt.com",
            "../secret.pdf",
            "application/pdf",
            10,
            1,
        )
        .is_err());
    }

    #[test]
    fn rejects_unsupported_provider() {
        assert!(validate_file_start(
            "00000000-0000-4000-8000-000000000001",
            "example.com",
            "report.pdf",
            "application/pdf",
            10,
            1,
        )
        .is_err());
    }

    #[test]
    fn rejects_wrong_chunk_count() {
        assert!(validate_file_start(
            "00000000-0000-4000-8000-000000000001",
            "chatgpt.com",
            "report.pdf",
            "application/pdf",
            10,
            0,
        )
        .is_err());
    }
}
