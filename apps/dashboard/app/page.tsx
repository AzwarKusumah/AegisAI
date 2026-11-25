"use client";

import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent } from "../lib/types";

function sizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function actorLabel(event: SecurityEvent) {
  if (event.actor.identity_source === "enterprise_sso" && event.actor.user_id) return event.actor.username + " · verified enterprise identity";
  if (event.actor.user_id) return event.actor.username + " · linked user ID";
  if (event.actor.identity_source === "local_os_account") return event.actor.username + " · OS account (unverified)";
  return event.actor.username + " · unresolved";
}
function inspectionLabel(event: SecurityEvent) {
  if (event.inspection.status === "completed") {
    return event.inspection.categories.length > 0 ? "Findings detected" : "No matches";
  }
  if (event.inspection.status === "failed") return "Inspection failed";
  if (event.inspection.status === "partial") return "Partially inspected";
  return "Not inspected";
}
function riskLabel(event: SecurityEvent) {
  return event.inspection.status === "completed" || event.inspection.status === "partial"
    ? event.inspection.risk_score + "/100"
    : "N/A";
}
function riskClass(event: SecurityEvent) {
  if (event.inspection.status === "failed") return "red";
  if (event.inspection.categories.length > 0) return "amber";
  return "neutral";
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
      if (!response.ok) throw new Error(data.error ?? "API request failed");
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
    users: new Set(events.map((event) => event.actor.username)).size
  }), [events]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">A</span><span>AegisAI<small>SECURITY CONSOLE</small></span></div>
      <div className="navItem active">Overview</div><div className="navItem">Security events</div>
      <div className="navItem disabled">Policies <small>Later</small></div><div className="navItem disabled">Devices <small>Later</small></div>
      <div className="sidebarFoot">SELF-HOSTED CONTROL PLANE<br/>EARLY ACCESS BUILD</div>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">MONITORING / AI DATA EXPOSURE</p><h1>Security overview</h1><p className="subhead">Local inspection results for files selected on supported AI services.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>
      <div className="notice"><strong>Detection mode</strong><span>Selected file bytes are scanned locally only when the extension is enabled. The server receives metadata and findings categories, never file contents. This version does not block provider uploads.</span></div>
      <div className="stats">
        <article className="stat"><span>Observed events</span><strong>{stats.observed}</strong><small>Selected attachment activity</small></article>
        <article className="stat"><span>Confirmed prevented</span><strong>{stats.prevented}</strong><small>Requires independent enforcement evidence</small></article>
        <article className="stat"><span>High / critical findings</span><strong>{stats.risky}</strong><small>Completed inspections only</small></article>
        <article className="stat"><span>Distinct OS accounts</span><strong>{stats.users}</strong><small>Not enterprise-verified</small></article>
      </div>
      <section className="panel">
        <div className="panelHead"><div><h2>Recent activity</h2><p>Local inspection results from supported AI-provider pages</p></div><button onClick={() => void load()}>Refresh</button></div>
        <form className="search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, filename, or provider..." />
          <button type="submit">Search</button>
        </form>
        <div className="tableWrap"><table><thead><tr><th>FILE</th><th>USER / DEVICE</th><th>AI PROVIDER</th><th>INSPECTION</th><th>RISK</th><th>TIME</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.event_id} onClick={() => setSelected(event)}>
            <td><div className="fileName">{event.file.name}</div><small>{event.file.extension || "file"} · {sizeLabel(event.file.size_bytes)}</small></td>
            <td><div>{actorLabel(event)}</div><small>{event.device.hostname}</small></td>
            <td><span className="provider">{event.provider}</span><small>{event.provider_domain}</small></td>
            <td><span className={"pill " + riskClass(event)}>{inspectionLabel(event)}</span><small>{event.inspection.categories.slice(0, 3).join(", ") || event.event_type.replace(/_/g, " ")}</small></td>
            <td><span className="risk">{riskLabel(event)}</span><small>{event.inspection.severity}</small></td>
            <td><span className="time">{new Date(event.occurred_at).toLocaleString()}</span></td>
          </tr>)}
          {events.length === 0 && <tr><td colSpan={6} className="empty">No events yet. Enable local inspection in the browser extension and select a file on a supported AI page.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">Up to 100 recent events · Raw file contents and matched values are never stored in this dashboard.</div>
      </section>
      {selected && <div className="overlay" onClick={() => setSelected(null)}><section className="detail" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={() => setSelected(null)}>Close</button><p className="eyebrow">EVENT DETAILS</p><h2>{selected.file.name}</h2>
        <dl><dt>Actor</dt><dd>{actorLabel(selected)}</dd><dt>Device</dt><dd>{selected.device.hostname} ({selected.device.os})</dd>
          <dt>Provider</dt><dd>{selected.provider} · {selected.provider_domain}</dd><dt>Event stage</dt><dd>{selected.event_type}</dd>
          <dt>Inspection</dt><dd>{inspectionLabel(selected)}</dd><dt>Risk score</dt><dd>{riskLabel(selected)} · {selected.inspection.severity}</dd>
          <dt>Categories</dt><dd>{selected.inspection.categories.join(", ") || "None recorded"}</dd>
          <dt>Enforcement</dt><dd>{selected.enforcement.confirmed ? "Confirmed by " + selected.enforcement.component : "Not confirmed"}</dd>
          <dt>Event ID</dt><dd className="mono">{selected.event_id}</dd><dt>Time</dt><dd>{new Date(selected.occurred_at).toLocaleString()}</dd>
        </dl>
        <p className="detailNote">The file was selected in a supported AI page and scanned locally. This event does not prove that the file reached the AI provider, and it does not indicate that an upload was blocked.</p>
      </section></div>}
    </section>
  </main>;
}
