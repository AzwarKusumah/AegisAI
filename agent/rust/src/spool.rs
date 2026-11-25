use anyhow::Result;
use serde_json::Value;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;

pub fn append(event: &Value) -> Result<()> {
    let directory = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("AegisAI")
        .join("events");
    create_dir_all(&directory)?;
    let path = directory.join("events.ndjson");
    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        OpenOptions::new()
            .create(true)
            .append(true)
            .mode(0o600)
            .open(path)?
    };
    #[cfg(not(unix))]
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    serde_json::to_writer(&mut file, event)?;
    file.write_all(b"\n")?;
    file.sync_data()?;
    Ok(())
}
