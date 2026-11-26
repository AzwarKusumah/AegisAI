# AegisAI Dashboard

Next.js audit console for metadata-only security events. The same application supports Docker and native systemd deployment.

## Configure and run locally

From this directory:

    npm install
    npm run dev

Set these server-side environment variables:

- AEGIS_API_URL=http://127.0.0.1:8787
- AEGIS_ADMIN_TOKEN=<control-plane admin token>
- AEGIS_DASHBOARD_USER=<dashboard username>
- AEGIS_DASHBOARD_PASSWORD=<long random dashboard password>

The application uses Next.js standalone output for production. Build and run:

    npm run build
    npm run start

For Docker and systemd installers, see ../../deployments/README.md.

## Authentication and proxy

The app is protected by HTTP Basic Authentication. Configure a strong unique password. For any network-accessible deployment, terminate HTTPS at a trusted reverse proxy; Basic Authentication credentials must not traverse plaintext HTTP.

The dashboard route at /api/events also sits behind the same authentication middleware. The control-plane admin token remains server-side and is never sent to browser JavaScript. Do not use NEXT_PUBLIC_ variables for credentials.

## Dashboard scope

The dashboard shows recent local inspection events, file metadata, actor attribution source, device, AI provider, event stage, inspection status, risk score, categories, and enforcement confirmation.

It is not an upload-blocking or policy-administration interface. An inspected attachment is not proof that a provider upload completed.
