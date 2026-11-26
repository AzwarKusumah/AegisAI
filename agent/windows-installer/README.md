# AegisAI Windows Installer

A single-file .NET WinForms installer. It embeds the native Rust Agent, browser extension, Python 3.12 embeddable runtime and local inspection engine. It performs enrollment and per-user Native Messaging registration without invoking PowerShell.

The release workflow prepares `bundle/installer-bundle.zip` and publishes a self-contained `AegisAI-Installer.exe`.

The extension still requires one-time manual loading as an unpacked extension unless the extension is published and force-installed through browser enterprise policy. The installer opens the browser extension settings and registers the extension ID entered by the administrator.
