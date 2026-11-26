"use client";

import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent } from "../lib/types";

function sizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function actorLabel(event: SecurityEvent) {
  if (event.actor.identity_source === "enterprise_sso" && event.actor.user_id) return event.actor.username + " · verified identity";
  if (event.actor.identity_source === "local_os_account") return event.actor.username + " · local account";
  return event.actor.username + " · unresolved";
}
function inspectionLabel(event: SecurityEvent) {
  if (event.outcome === "prevented" && event.enforcement.confirmed) return "Browser blocked";
  if (event.inspection.status === "completed") return event.inspection.categories.length > 0 ? "Findings detected" : "No matches";
  if (event.inspection.status === "failed") return "Inspection failed";
  if (event.inspection.status === "partial") return "Partially inspected";
  return "Not inspected";
}
function riskLabel(event: SecurityEvent) {
  return event.inspection.status === "completed" || event.inspection.status === "partial" ? event.inspection.risk_score + "/100" : "N/A";
}
function riskClass(event: SecurityEvent) {
  if (event.outcome === "prevented" || event.inspection.status === "failed") return "statusBad";
  if (event.inspection.categories.length > 0) return "statusWarn";
  return "statusGood";
}

export default function Home() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading");
  const [selected, setSelected] = useState<SecurityEvent | null>(null);

  async function load(search = query) {
    setStatus("Loading");
    try {
      const response = await fetch("/api/events?q=" + encodeURIComponent(search), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load events");
      setEvents(data.events ?? []);
      setStatus("Connected");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Control plane unavailable");
      setEvents([]);
    }
  }
  useEffect(() => { void load(""); }, []);

  const stats = useMemo(() => ({
    observed: events.filter((event) => event.outcome === "observed").length,
    prevented: events.filter((event) => event.outcome === "prevented" && event.enforcement.confirmed).length,
    risky: events.filter((event) => event.inspection.status === "completed" && ["high", "critical"].includes(event.inspection.severity)).length,
    devices: new Set(events.map((event) => event.device.device_id)).size
  }), [events]);

  return <main className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brandMark">A</span><span>AegisAI<small>Data protection</small></span></a>
      <nav className="navGroup" aria-label="Main navigation">
        <a className="navItem active" href="/" aria-current="page">Activity</a>
        <a className="navItem" href="/files">Files</a>
        <a className="navItem" href="/devices">Devices</a>
        <a className="navItem" href="/policies">Policies</a>
      </nav>
      <div className="sidebarFoot">Self-hosted deployment</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">Monitoring</p><h1>Security activity</h1><p className="subhead">File inspections and policy decisions from enrolled computers.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>

      <div className="inlineNote"><strong>How protection works</strong><span>Attachments on supported AI sites are inspected locally. Active policies decide whether the browser can continue. Only event metadata and policy results are sent to this server.</span></div>

      <div className="stats">
        <article className="stat"><span>Inspected</span><strong>{stats.observed}</strong><small>Files allowed or audited</small></article>
        <article className="stat"><span>Browser blocks</span><strong>{stats.prevented}</strong><small>Attachment event stopped before page handling</small></article>
        <article className="stat"><span>High-risk findings</span><strong>{stats.risky}</strong><small>Completed inspections</small></article>
        <article className="stat"><span>Computers seen</span><strong>{stats.devices}</strong><small>In this activity window</small></article>
      </div>

      <section className="panel">
        <div className="panelHead"><div><h2>Recent activity</h2><p>Latest file inspections and enforcement outcomes</p></div><button className="button buttonSecondary" onClick={() => void load()}>Refresh</button></div>
        <form className="search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by user, filename, or provider" aria-label="Search activity" />
          <button className="button buttonPrimary" type="submit">Search</button>
        </form>
        <div className="tableWrap"><table><thead><tr><th>File</th><th>User and computer</th><th>Service</th><th>Result</th><th>Risk</th><th>Time</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.event_id} onClick={() => setSelected(event)} tabIndex={0} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") setSelected(event); }}>
            <td><div className="fileName">{event.file.name}</div><small>{event.file.extension || "file"} · {sizeLabel(event.file.size_bytes)}</small></td>
            <td><div>{actorLabel(event)}</div><small>{event.device.hostname}</small></td>
            <td><span className="provider">{event.provider}</span></td>
            <td><span className={"statusText " + riskClass(event)}>{inspectionLabel(event)}</span><small>{event.policy_name || event.inspection.categories.slice(0, 2).join(", ") || event.event_type.replace(/_/g, " ")}</small></td>
            <td><span className="risk">{riskLabel(event)}</span><small>{event.inspection.severity}</small></td>
            <td><span className="time">{new Date(event.occurred_at).toLocaleString()}</span></td>
          </tr>)}
          {events.length === 0 && <tr><td colSpan={6} className="empty">No activity yet. Enroll a computer and inspect a test attachment.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">Showing up to 100 recent events. Select a row for policy and document details.</div>
      </section>

      {selected && <div className="overlay" onClick={() => setSelected(null)}>
        <section className="detail" onClick={(event) => event.stopPropagation()} aria-label="Event details">
          <button className="close" onClick={() => setSelected(null)}>Close</button>
          <p className="eyebrow">Event details</p>
          <h2>{selected.file.name}</h2>
          <div className={"detailResult " + riskClass(selected)}>{inspectionLabel(selected)}</div>
          <dl>
            <dt>User</dt><dd>{actorLabel(selected)}</dd>
            <dt>Computer</dt><dd>{selected.device.hostname} · {selected.device.os}</dd>
            <dt>Service</dt><dd>{selected.provider} · {selected.provider_domain}</dd>
            <dt>File</dt><dd>{selected.file.mime_type || "Unknown type"} · {sizeLabel(selected.file.size_bytes)}</dd>
            <dt>Inspection</dt><dd>{selected.inspection.status} · {selected.inspection.risk_score}/100 · {selected.inspection.severity}</dd>
            <dt>Findings</dt><dd>{selected.inspection.categories.join(", ") || "None recorded"}</dd>
            <dt>Policy</dt><dd>{selected.policy_name || "No matching policy"}{selected.policy_action ? " · " + selected.policy_action : ""}</dd>
            <dt>Enforcement</dt><dd>{selected.enforcement.confirmed ? "Confirmed by " + selected.enforcement.component : "No block recorded"}</dd>
            <dt>Event ID</dt><dd className="mono">{selected.event_id}</dd>
            <dt>Time</dt><dd>{new Date(selected.occurred_at).toLocaleString()}</dd>
          </dl>
          {selected.redacted_preview ? <section className="previewPanel">
            <h3>Redacted document preview</h3>
            <pre>{selected.redacted_preview}</pre>
            <p>Detected values were masked on the endpoint before this preview was sent.</p>
          </section> : <p className="detailNote">No document preview was shared for this event. Administrators can enable a redacted preview on a policy. Original files and matched values are not stored here.</p>}
        </section>
      </div>}
    </section>
  </main>;
}
