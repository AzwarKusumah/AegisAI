# Windows endpoint enrollment troubleshooting

## Use the Control Plane URL, not the internal service address

The Windows installer must be given the public HTTPS URL that routes to the AegisAI Control Plane.

For the default Docker deployment, the host port is bound to `127.0.0.1:8787`. This keeps the Control Plane private behind a reverse proxy. A Windows endpoint outside the VPS cannot normally reach it at `https://<VPS-IP>:8787`.

Use a public DNS hostname with a valid TLS certificate, for example:

```text
https://dlp.example.com
```

Configure the reverse proxy to forward these paths to the Control Plane:

- `/healthz`
- `/api/v1/*`

Do not expose port 8787 directly without deliberately changing the bind/firewall configuration and providing TLS termination.

## Verify from the Windows endpoint

Open the following URL in a browser on the endpoint:

```text
https://dlp.example.com/healthz
```

Expected response:

```json
{"status":"ok"}
```

An HTTP 502/404 usually means the reverse proxy is pointing to the wrong upstream or path. A certificate warning indicates that the HTTPS certificate is not trusted or does not match the hostname. A timeout usually means the public listener, firewall, cloud security group, or reverse-proxy route is not reachable.

## Pairing code behavior

The installer checks `/healthz` before posting `/api/v1/agents/enroll`. A failed health check does not consume the one-time pairing code. Pairing codes remain single-use after a successful enrollment and expire according to the configured 1–24 hour lifetime.

## Use the correct Windows package

Download `AegisAI-Installer-Windows-x86_64.exe` from the `release-installer-windows` artifact of the latest successful **Build endpoint and browser packages** workflow. Do not use the older agent ZIP or the legacy PowerShell GUI installer package. The self-contained .NET installer does not require a Python path and does not launch PowerShell on the endpoint.
