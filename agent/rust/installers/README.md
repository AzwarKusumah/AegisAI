# Endpoint Agent Installation

## Windows: single-file installer

Download **AegisAI-Installer-Windows-x86_64.exe** from the release-installer-windows GitHub Actions artifact or GitHub Release.

The self-contained installer includes:
- The Rust Native Messaging Agent.
- Python 3.12 embeddable runtime and document-parser dependencies.
- The local inspection engine.
- The Chromium extension package.

No PowerShell window, Python install, Rust toolchain, or extracted installer ZIP is needed. Run the EXE, open the browser extension settings from the installer, load the unpacked extension folder once, copy its 32-character ID into the installer, select Edge or Chrome, enter the HTTPS Control Plane API URL and a fresh one-time pairing code, then install and pair. The installer writes the per-user Native Messaging registration and endpoint configuration.

A browser extension cannot be silently enabled in a normal consumer browser by a local executable. Automatic browser deployment requires store publication or a managed enterprise force-install policy. The installer therefore performs the native-host setup and guides the one-time extension load.

The executable is currently unsigned; use artifacts from the trusted AegisAI repository and verify the supplied SHA-256 checksum.

## Linux and macOS

1. Download and extract the archive matching your OS and CPU architecture.
2. Install the AegisAI extension in a supported browser.
3. Run the bundled installer:

       ./install-unix.sh --browser chrome --extension-id YOUR_EXTENSION_ID
       ./install-unix.sh --browser firefox

The guided per-device flow is currently Windows-only. Linux and macOS still use the documented local installer/runtime setup.

## Runtime configuration

Windows per-user configuration: %APPDATA%\AegisAI\config.json.
Windows Agent data and runtime: %LOCALAPPDATA%\AegisAI.
Linux: $XDG_CONFIG_HOME/AegisAI/config.json or ~/.config/AegisAI/config.json.
macOS: ~/Library/Application Support/AegisAI/config.json.

Do not share these configuration files; they contain the device token.

## Inspection scope and limitations

The Agent validates Native Messaging messages and scans supported text, text-based PDF, DOCX, XLSX and ZIP files locally. Its 10 MiB file limit, unsupported/encrypted documents, and extraction errors are treated as uninspectable. Managed-device policies fail closed for uninspectable attachments.

The Agent retrieves its policy set for each attachment scan. It evaluates enabled rules in ascending priority order, checks exceptions, and returns block, audit or allow. Raw files and matched values stay on the endpoint. Optional previews are redacted locally and only shared when a policy explicitly enables preview sharing.

Browser enforcement is a client-side event gate for supported file-input, drop and paste paths. It is not a network-level or OS-level DLP boundary.
