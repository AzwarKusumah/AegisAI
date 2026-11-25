# Native Messaging Host Installation

## Windows

Build the agent first:

    cd agent/rust
    cargo build --release

Install for Chrome:

    .\installers\install-windows.ps1 -Browser chrome -ExtensionId YOUR_UNPACKED_EXTENSION_ID

Install for Edge:

    .\installers\install-windows.ps1 -Browser edge -ExtensionId YOUR_UNPACKED_EXTENSION_ID

Install for Firefox:

    .\installers\install-windows.ps1 -Browser firefox

The installer creates the browser-specific host manifest, adds the per-user registry entry, and sets AEGIS_ENGINE_PATH and AEGIS_PYTHON for the current Windows user. Restart the browser after installation.

For Chrome/Edge, find the unpacked extension ID at chrome://extensions or edge://extensions and pass it exactly. Firefox uses the fixed add-on ID aegisai@example.invalid in manifest.firefox.json; do not change one without changing the installer and host validation too.

The Firefox native host manifest uses allowed_extensions. The Rust agent validates the add-on ID passed by Firefox and checks that the supplied host-manifest path resolves to the registered per-user AegisAI manifest. Chromium uses allowed_origins and the exact extension-origin allowlist.

## Manual configuration

If you do not use the installer, create the native host manifest with an absolute executable path. Register the manifest path in the browser's per-user NativeMessagingHosts registry key. Set AEGIS_ENGINE_PATH to the repository engine directory, AEGIS_PYTHON to a Python executable, and AEGIS_EXTENSION_ORIGINS to the exact chromium extension origin.

Do not set AEGIS_ALLOW_UNVERIFIED_ORIGIN on a managed endpoint.
