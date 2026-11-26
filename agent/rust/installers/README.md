# Native Messaging Host Installation

Release downloads contain the prebuilt Rust executable and local Python inspection engine. No Rust toolchain is required on endpoint machines. Python 3.11+ is required at runtime.

## Windows

1. Download and extract aegisai-agent-windows-x86_64.zip.
2. Install the matching AegisAI browser extension.
3. Open PowerShell in the extracted folder.
4. Run the matching command:

       .\install-windows.ps1 -Browser chrome -ExtensionId YOUR_EXTENSION_ID
       .\install-windows.ps1 -Browser edge -ExtensionId YOUR_EXTENSION_ID
       .\install-windows.ps1 -Browser firefox

The installer copies the executable and engine to %LOCALAPPDATA%\AegisAI, creates a Python virtual environment, installs document extraction dependencies, registers the browser Native Messaging host, and writes per-user settings to %APPDATA%\AegisAI\config.json.

For Chrome/Edge, find the extension ID at chrome://extensions or edge://extensions. Firefox uses the fixed add-on ID aegisai@example.invalid.

Optional control-plane configuration can be passed using -ControlPlaneUrl and -AgentToken.

## Linux and macOS

1. Download and extract the archive matching your OS and CPU architecture.
2. Install the AegisAI extension in Chrome/Chromium/Brave/Edge or Firefox.
3. Run the bundled installer:

       ./install-unix.sh --browser chrome --extension-id YOUR_EXTENSION_ID
       ./install-unix.sh --browser firefox

Supported browser values: chrome, chromium, brave, edge, and firefox.

Optional control-plane configuration:

       ./install-unix.sh --browser chrome --extension-id YOUR_EXTENSION_ID --control-plane-url https://aegis.example.com --agent-token YOUR_AGENT_TOKEN

The installer copies the agent and engine to the per-user AegisAI data directory, creates a Python virtual environment, installs document dependencies, registers the Native Messaging host, and writes settings under the per-user configuration directory. Configuration files are created with owner-only permissions.

## Package contents and runtime requirements

- Native Rust agent built for the package OS/architecture.
- Python detection-engine source.
- Browser-specific Native Messaging installer and setup instructions.
- Python 3.11+ required at endpoint runtime; the installer creates an isolated venv and installs PDF/DOCX/XLSX dependencies.
- No Rust compiler is required on endpoint machines.
- Raw selected files are inspected locally; only metadata is sent to the control plane.

## Runtime configuration

Per-user configuration:
- Windows: %APPDATA%\AegisAI\config.json
- Linux: $XDG_CONFIG_HOME/AegisAI/config.json or ~/.config/AegisAI/config.json
- macOS: ~/Library/Application Support/AegisAI/config.json

Do not share this file; it may contain the endpoint's agent token.

## Current limitations

The extension detects file selection and performs local inspection; it does not guarantee upload cancellation or network-level blocking. This release package is not a production DLP enforcement control.
