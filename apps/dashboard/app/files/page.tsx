"use client";

import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent } from "../../lib/types";

type FileRecord = {
  key: string; name: string; extension: string; mime: string; size: number;
  device: string; provider: string; lastSeen: string; observations: number;
  tags: string[]; severity: string; risk: number;
};
function sizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
export default function FileInventoryPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [status, setStatus] = useState("Loading");
  const [query, setQuery] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/events?limit=500", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load file metadata");
        setEvents(data.events ?? []);
        setStatus("Connected");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Control plane unavailable");
      }
    })();
  }, []);
  const files = useMemo(() => {
    const grouped = new Map<string, FileRecord>();
    for (const event of events) {
      const key = [event.device.device_id, event.file.name, event.file.extension].join("|");
      const current = grouped.get(key);
      if (current) {
        current.observations += 1;
        if (new Date(event.occurred_at).getTime() > new Date(current.lastSeen).getTime()) {
          current.lastSeen = event.occurred_at;
          current.provider = event.provider;
          current.tags = event.inspection.categories;
          current.severity = event.inspection.severity;
          current.risk = event.inspection.risk_score;
        }
      } else {
        grouped.set(key, {
          key, name: event.file.name, extension: event.file.extension, mime: event.file.mime_type,
          size: event.file.size_bytes, device: event.device.hostname, provider: event.provider,
          lastSeen: event.occurred_at, observations: 1, tags: event.inspection.categories,
          severity: event.inspection.severity, risk: event.inspection.risk_score
        });
      }
    }
    const q = query.toLowerCase().trim();
    return [...grouped.values()].filter((item) => !q || [item.name, item.extension, item.device, item.provider, ...item.tags].join(" ").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [events, query]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">A</span><span>AegisAI<small>SECURITY CONSOLE</small></span></div>
      <a className="navItem" href="/">Overview</a>
      <a className="navItem active" href="/files">File inventory</a>
      <a className="navItem" href="/devices">Devices</a>
      <div className="navItem disabled">Policies <small>Next phase</small></div>
      <div className="sidebarFoot">METADATA ONLY<br/>NO FILE CONTENTS STORED</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">OBSERVED FILE METADATA</p><h1>File inventory</h1><p className="subhead">Observed filenames and inspection tags grouped by endpoint.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>
      <div className="notice"><strong>Privacy model</strong><span>This is an inventory of file metadata observed in security events, not a central file repository. AegisAI does not upload or store the original file bytes or matched secret values.</span></div>
      <section className="panel">
        <div className="panelHead"><div><h2>Observed files</h2><p>{files.length} unique device-and-filename records in the latest event window</p></div></div>
        <form className="search" onSubmit={(event) => event.preventDefault()}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, device, provider, or metadata tag..." />
        </form>
        <div className="tableWrap"><table><thead><tr><th>FILE</th><th>DEVICE</th><th>PROVIDER</th><th>METADATA TAGS</th><th>RISK</th><th>OBSERVED</th><th>LAST SEEN</th></tr></thead>
          <tbody>{files.map((item) => <tr key={item.key}>
            <td><div className="fileName">{item.name}</div><small>{item.extension || "file"} · {sizeLabel(item.size)} · {item.mime || "unknown type"}</small></td>
            <td>{item.device}</td><td><span className="provider">{item.provider}</span></td>
            <td><div className="tagList">{item.tags.length ? item.tags.map((tag) => <span className="tagChip" key={tag}>{tag.replace(/_/g, " ")}</span>) : <span className="muted">No tags</span>}</div></td>
            <td><span className={"pill " + (item.severity === "critical" || item.severity === "high" ? "red" : item.tags.length ? "amber" : "teal")}>{item.risk}/100 · {item.severity}</span></td>
            <td>{item.observations}</td><td><span className="time">{new Date(item.lastSeen).toLocaleString()}</span></td>
          </tr>)}
          {files.length === 0 && <tr><td colSpan={7} className="empty">No file metadata available yet. Connect an endpoint and inspect a test file.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">Inventory is derived from the latest 500 security events; it does not retain or expose file contents.</div>
      </section>
    </section>
  </main>;
}
