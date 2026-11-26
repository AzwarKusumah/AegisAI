"use client";

import { useCallback, useEffect, useState } from "react";
import type { ManagedDevice } from "../../lib/types";

type Pairing = { code: string; expires_at: string; expires_in_hours: number };

function lastSeen(value: string | null) {
  if (!value) return "Never connected";
  return new Date(value).toLocaleString();
}
function connectionState(device: ManagedDevice) {
  if (device.status !== "active") return "Revoked";
  if (!device.last_seen_at) return "Awaiting first event";
  return Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60 * 1000 ? "Recently active" : "No recent activity";
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState("Loading devices");
  const [busy, setBusy] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("1");

  const load = useCallback(async () => {
    setStatus("Loading devices");
    try {
      const response = await fetch("/api/devices", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load devices");
      setDevices(data.devices ?? []);
      setStatus("Connected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Control plane unavailable");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createPairing() {
    setBusy(true);
    setPairing(null);
    try {
      const response = await fetch("/api/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in_hours: Number(expiresInHours) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not generate pairing code");
      setPairing(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pairing code generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: ManagedDevice) {
    if (!window.confirm("Revoke this device credential? It will need a new pairing code to reconnect.")) return;
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.device_id), { method: "DELETE" });
      if (!response.ok) throw new Error("Device revocation failed");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Device revocation failed");
    }
  }

  return <main className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brandMark">A</span><span>AegisAI<small>Data protection</small></span></a>
      <nav className="navGroup" aria-label="Main navigation">
        <a className="navItem" href="/">Activity</a>
        <a className="navItem" href="/files">Files</a>
        <a className="navItem active" href="/devices" aria-current="page">Devices</a>
        <a className="navItem" href="/policies">Policies</a>
      </nav>
      <div className="sidebarFoot">Self-hosted deployment</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>

    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">Endpoint management</p><h1>Devices</h1><p className="subhead">Connect and manage computers protected by AegisAI.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>

      <section className="panel pairingPanel">
        <div className="panelHead">
          <div><h2>Enroll a computer</h2><p>Create a one-time code for the Windows installer.</p></div>
          <div className="pairingActions">
            <label className="fieldGroup">
              <span>Code lifetime</span>
              <select className="control" value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)}>
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="4">4 hours</option>
                <option value="8">8 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
              </select>
            </label>
            <button className="button buttonPrimary" onClick={() => void createPairing()} disabled={busy}>
              {busy ? "Creating code…" : "Create pairing code"}
            </button>
          </div>
        </div>

        {pairing ? <div className="pairingCode">
          <div><span className="fieldHint">One-time pairing code</span><strong>{pairing.code}</strong></div>
          <div className="pairingCodeMeta">
            <p>Expires {new Date(pairing.expires_at).toLocaleString()} · {pairing.expires_in_hours} hour{pairing.expires_in_hours === 1 ? "" : "s"}</p>
            <button className="button buttonSecondary" onClick={() => void navigator.clipboard.writeText(pairing.code)}>Copy code</button>
          </div>
        </div> : <div className="panelFoot">Codes can be used once and are stored as hashes. Choose a lifetime from 1 to 24 hours.</div>}
        <div className="inlineNote"><strong>Installer</strong><span>Use the AegisAI Windows installer (.exe), then enter the API address and this code. Remote connections should use HTTPS.</span></div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <div><h2>Registered computers</h2><p>{devices.length} enrolled endpoint{devices.length === 1 ? "" : "s"}</p></div>
          <button className="button buttonSecondary" onClick={() => void load()}>Refresh</button>
        </div>
        <div className="tableWrap"><table><thead><tr><th>Computer</th><th>Operating system</th><th>Local account</th><th>Connection</th><th>Last activity</th><th></th></tr></thead>
          <tbody>{devices.map((device) => <tr key={device.device_id}>
            <td><div className="fileName">{device.hostname}</div><small className="mono">{device.device_id}</small></td>
            <td>{device.os}</td><td>{device.username}</td>
            <td><span className={"statusText " + (device.status === "active" ? "statusGood" : "statusBad")}>{connectionState(device)}</span></td>
            <td><span className="time">{lastSeen(device.last_seen_at)}</span></td>
            <td>{device.status === "active" ? <button className="button buttonDanger" onClick={() => void revoke(device)}>Revoke</button> : <span className="muted">Revoked</span>}</td>
          </tr>)}
          {devices.length === 0 && <tr><td colSpan={6} className="empty">No computers enrolled. Create a pairing code to connect the first endpoint.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">Activity is based on the last security event received. It is not a continuous heartbeat.</div>
      </section>
    </section>
  </main>;
}
