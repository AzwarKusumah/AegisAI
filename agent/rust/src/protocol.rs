use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BrowserObservation {
    pub provider: String,
    pub provider_domain: String,
    pub event_type: String,
    pub file: ObservedFile,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObservedFile { pub name: String, pub mime_type: String, pub size_bytes: u64 }

impl BrowserObservation {
    pub fn validate(&self) -> Result<()> {
        let providers = ["chatgpt.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "perplexity.ai", "grok.com"];
        if !providers.contains(&self.provider_domain.as_str()) { return Err(anyhow!("unsupported provider domain")); }
        if self.event_type != "attachment_selected" { return Err(anyhow!("unsupported event type")); }
        if self.file.name.trim().is_empty() || self.file.name.len() > 1024 { return Err(anyhow!("invalid file name")); }
        if self.file.mime_type.len() > 127 || self.file.size_bytes > 1_073_741_824 { return Err(anyhow!("file metadata exceeds limits")); }
        Ok(())
    }
}

#[derive(Debug, Serialize)] pub struct Actor { pub user_id: Option<String>, pub username: String, pub identity_source: String }
#[derive(Debug, Serialize)] pub struct Device { pub device_id: String, pub hostname: String, pub os: String }
#[derive(Debug, Serialize)] pub struct FileMetadata { pub name: String, pub extension: String, pub mime_type: String, pub size_bytes: u64 }
#[derive(Debug, Serialize)] pub struct Inspection { pub status: String, pub risk_score: u8, pub severity: String, pub categories: Vec<String> }
#[derive(Debug, Serialize)] pub struct Enforcement { pub confirmed: bool, pub component: String }
#[derive(Debug, Serialize)]
pub struct SecurityEvent {
    pub event_id: String, pub occurred_at: String, pub actor: Actor, pub device: Device,
    pub provider: String, pub provider_domain: String, pub event_type: String,
    pub file: FileMetadata, pub inspection: Inspection, pub outcome: String, pub enforcement: Enforcement,
}

pub fn read_message<R: Read>(reader: &mut R, max_bytes: usize) -> Result<Option<Vec<u8>>> {
    let mut header = [0u8; 4];
    if reader.read(&mut header[..1])? == 0 { return Ok(None); }
    reader.read_exact(&mut header[1..])?;
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > max_bytes { return Err(anyhow!("Native Messaging frame exceeds size limit")); }
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
        let payload = br#"{"ok":true}"#;
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
    fn rejects_unknown_provider() {
        let input = BrowserObservation {
            provider: "Unknown".into(), provider_domain: "example.com".into(),
            event_type: "attachment_selected".into(),
            file: ObservedFile { name: "report.pdf".into(), mime_type: "application/pdf".into(), size_bytes: 10 },
        };
        assert!(input.validate().is_err());
    }
}
