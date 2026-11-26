"use client";

import { useCallback, useEffect, useState } from "react";
import type { ManagedDevice } from "../../lib/types";

type Pairing = { code: string; expires_at: string };

function lastSeen(value: string | null) {
  if (!value) return "Never connected";
  return new Date(value).toLocaleString();
}
function connectionState(device: ManagedDevice) {
  if (device.status !== "active") return "Revoked";
  if (!device.last_seen_at) return "Awaiting first event";
  return Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60 * 1000 ? "Recently active" : "Not recently seen";
}
export default function DevicesPage() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState("Loading devices...");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("Loading devices...");
    try {
      const response = await fetch("/api/devices", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load devices");
      setDevices(data.devices ?? []);
      setStatus("Device inventory connected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Control plane unavailable");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createPairing() {
    setBusy(true);
    setPairing(null);
    try {
      const response = await fetch("/api/pairing-codes", { method: "POST" });
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
    if (!window.confirm("Revoke this device credential? The endpoint will stop sending events until it is enrolled again.")) return;
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
      <div className="brand"><span className="brandMark">A</span><span>AegisAI<small>SECURITY CONSOLE</small></span></div>
      <a className="navItem" href="/">Overview</a>
      <a className="navItem" href="/files">File inventory</a>
      <a className="navItem active" href="/devices">Devices</a>
      <div className="navItem disabled">Policies <small>Next phase</small></div>
      <div className="sidebarFoot">SELF-HOSTED CONTROL PLANE<br/>DEVICE ENROLLMENT</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">ENDPOINT MANAGEMENT</p><h1>Devices</h1><p className="subhead">Enroll, view, and revoke AegisAI endpoint agents.</p></div>
        <div className={"connection " + (status === "Device inventory connected" ? "online" : "offline")}><i />{status}</div>
      </header>
      <section className="panel pairingPanel">
        <div className="panelHead">
          <div><h2>Enroll a new endpoint</h2><p>Create a one-time pairing code for the Windows, Linux, or macOS installer.</p></div>
          <button onClick={() => void createPairing()} disabled={busy}>{busy ? "Generating..." : "Generate pairing code"}</button>
        </div>
        {pairing ? <div className="pairingCode">
          <span>ONE-TIME PAIRING CODE</span>
          <strong>{pairing.code}</strong>
          <p>Expires: {new Date(pairing.expires_at).toLocaleString()} · Valid for one enrollment only.</p>
          <button onClick={() => void navigator.clipboard.writeText(pairing.code)}>Copy code</button>
        </div> : <div className="panelFoot">The code is shown once and stored on the server only as a SHA-256 hash. It expires after 10 minutes.</div>}
        <div className="notice"><strong>Installer connection</strong><span>Use an HTTPS API URL for remote enrollment, or http://localhost:8787 while forwarding the Control Plane through an SSH tunnel. Never expose PostgreSQL or the internal admin token to endpoints.</span></div>
      </section>
      <section className="panel">
        <div className="panelHead"><div><h2>Registered endpoints</h2><p>Device credentials are unique and can be revoked independently.</p></div><button onClick={() => void load()}>Refresh</button></div>
        <div className="tableWrap"><table><thead><tr><th>DEVICE</th><th>OS</th><th>LOCAL ACCOUNT</th><th>STATUS</th><th>LAST SEEN</th><th>ACTION</th></tr></thead>
          <tbody>{devices.map((device) => <tr key={device.device_id}>
            <td><div className="fileName">{device.hostname}</div><small className="mono">{device.device_id}</small></td>
            <td>{device.os}</td><td>{device.username}</td>
            <td><span className={"pill " + (device.status === "active" ? "teal" : "red")}>{connectionState(device)}</span></td>
            <td><span className="time">{lastSeen(device.last_seen_at)}</span></td>
            <td>{device.status === "active" ? <button className="dangerButton" onClick={() => void revoke(device)}>Revoke</button> : <span className="muted">Revoked</span>}</td>
          </tr>)}
          {devices.length === 0 && <tr><td colSpan={6} className="empty">No enrolled agents yet. Generate a pairing code to connect your first endpoint.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">“Recently active” means the agent delivered an event within the last five minutes; this is not a continuous heartbeat.</div>
      </section>
    </section>
  </main>;
}
