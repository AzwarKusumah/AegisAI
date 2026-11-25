# AegisAI Dashboard

Next.js audit console for metadata-only security events.

Run:
    npm install
    AEGIS_API_URL=http://127.0.0.1:8787 AEGIS_ADMIN_TOKEN=replace-admin-token npm run dev

The server route at /api/events forwards requests to the Go control plane. The admin token is server-side only and must never use a NEXT_PUBLIC_ variable.

The dashboard shows recent attachment-selection events, file metadata, actor attribution source, device, AI provider, event stage, inspection risk, and enforcement confirmation. It is not an upload-blocking or policy-administration interface.
