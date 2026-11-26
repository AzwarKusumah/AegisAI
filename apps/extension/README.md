# AegisAI Browser Extension

Version 0.4.0 builds separate Chromium and Firefox packages from the same TypeScript source. Both packages use Manifest V3 with browser-specific background declarations.

## Build both browser packages

From this directory:

    npm install
    npm run typecheck
    npm run build
    npm run test:packages

Build only one target:

    npm run build:chromium
    npm run build:firefox

The generated, loadable extension directories are:
- dist/chromium — Chrome, Edge, Brave, and other Chromium browsers (Manifest V3 service worker).
- dist/firefox — Firefox (Manifest V3 background scripts/event page).

Load the corresponding directory as an unpacked/temporary extension in the browser's developer extension page. The generated folders include their own manifest.json, compiled bundles, and popup assets. Build outputs are generated locally and are not committed.

## Download ready-to-load ZIP packages

GitHub Actions automatically creates:
- aegisai-extension-chromium.zip — Chrome, Edge, Brave, and Chromium-based browsers.
- aegisai-extension-firefox.zip — Firefox.

Download them from the **release-extensions** artifact in the latest successful **Build endpoint and browser packages** workflow run, or from a versioned GitHub Release. Extract the archive and load the folder containing manifest.json using the browser's developer extension page.

The ZIPs are loadable extension packages for development/managed unpacked installation. They are not signed CRX/XPI store packages. Chrome Web Store and Mozilla Add-ons signing/publishing require their separate store process.

## User consent and privacy

Inspection is off by default. The user must enable “Inspect selected AI attachments” in the extension popup. When enabled, the content script reads selected file bytes and streams them in ordered 256 KiB chunks to the local Rust Native Messaging host.

The file bytes do not go to the AegisAI control plane. Only the Rust agent's metadata-only inspection result is sent to the server. The matched secret/PII values and extracted document text are never included in an event.

## Limits

- Supported provider domains are configured in src/providers.ts and both manifests.
- Current file size limit is 10 MiB.
- Files are read locally after the provider file input changes.
- This version does not cancel the provider's upload, inspect clipboard content, or prevent a send action.
- Provider DOM and upload behavior can change; test each supported provider before production rollout.
