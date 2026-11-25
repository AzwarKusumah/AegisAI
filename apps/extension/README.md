# Browser Extension

The extension observes file selection on supported AI-provider pages and forwards metadata to the Rust Native Messaging host.

Build: npm install, npm run typecheck, npm run build.

It sends provider ID/domain, file basename, MIME type, and size only. It never reads file bytes or extracts document text.

The event means attachment_selected, not a confirmed upload. Provider DOM and upload workflows change and require compatibility tests. This milestone does not intercept network requests, block uploads, or inspect clipboard contents. Firefox and Chromium packaging/registration need browser-specific validation.
