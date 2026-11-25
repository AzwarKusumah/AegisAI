# AegisAI Browser Extension

Version 0.3 provides opt-in local inspection of file attachments selected on supported AI-provider pages.

## User consent and privacy

Inspection is off by default. The user must enable “Inspect selected AI attachments” in the extension popup. When enabled, the content script reads selected file bytes and streams them in ordered 256 KiB chunks to the local Rust Native Messaging host.

The file bytes do not go to the AegisAI control plane. Only the Rust agent's metadata-only inspection result is sent to the server. The matched secret/PII values and extracted document text are never included in an event.

## Build

    npm install
    npm run typecheck
    npm run build

Load the extension directory with the Chromium manifest or package it with the Firefox manifest. The popup assets are static and are included automatically.

## Limits

- Supported provider domains are configured in providers.ts and the manifests.
- Current file size limit is 10 MiB.
- Files are read locally after the provider file input changes.
- This version does not cancel the provider's upload, inspect clipboard content, or prevent a send action.
- Provider DOM and upload behavior can change; test each supported provider before production rollout.
