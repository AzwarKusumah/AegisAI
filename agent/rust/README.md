# Rust Endpoint Agent

The Rust agent is a cross-platform Native Messaging host. It validates attachment metadata, enriches it with device and local OS-account context, writes a local NDJSON metadata spool, and optionally forwards events to the Go control plane.

Build and test with cargo test and cargo build --release.

Configure the exact browser extension origin in AEGIS_EXTENSION_ORIGINS as a comma-separated list. AEGIS_ALLOW_UNVERIFIED_ORIGIN=1 bypasses the origin check for local protocol testing only; never use that bypass in a managed deployment.

The host uses Native Messaging framing: 4-byte little-endian length followed by UTF-8 JSON, with a 1 MiB maximum frame.

Environment:
- AEGIS_EXTENSION_ORIGINS
- AEGIS_CONTROL_PLANE_URL
- AEGIS_AGENT_TOKEN
- AEGIS_ALLOW_UNVERIFIED_ORIGIN (development only)

The local spool is under the OS local application-data directory in AegisAI/events/events.ndjson. On Unix, newly created files use mode 0600.

The agent records the OS username as local_os_account, not as a verified enterprise identity. It does not read file bytes, inspect content, block uploads, or claim prevention. Local spool retry and retention controls remain future work.
