"use client";

import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent } from "../../lib/types";

type FileRecord = {
  key: string; name: string; extension: string; mime: string; size: number;
  device: string; provider: string; lastSeen: string; observations: number;
  tags: string[]; severity: string; risk: number; outcome: string;
  policy: string; preview?: string;
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
  const [selected, setSelected] = useState<FileRecord | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/events?limit=500", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load file records");
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
          current.outcome = event.outcome;
          current.policy = event.policy_name ?? "";
          current.preview = event.redacted_preview;
        }
      } else {
        grouped.set(key, {
          key, name: event.file.name, extension: event.file.extension, mime: event.file.mime_type,
          size: event.file.size_bytes, device: event.device.hostname, provider: event.provider,
          lastSeen: event.occurred_at, observations: 1, tags: event.inspection.categories,
          severity: event.inspection.severity, risk: event.inspection.risk_score,
          outcome: event.outcome, policy: event.policy_name ?? "", preview: event.redacted_preview
        });
      }
    }
    const q = query.toLowerCase().trim();
    return [...grouped.values()].filter((item) => !q || [item.name, item.extension, item.device, item.provider, ...item.tags].join(" ").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [events, query]);

  return <main className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brandMark">A</span><span>AegisAI<small>Data protection</small></span></a>
      <nav className="navGroup" aria-label="Main navigation">
        <a className="navItem" href="/">Activity</a>
        <a className="navItem active" href="/files" aria-current="page">Files</a>
        <a className="navItem" href="/devices">Devices</a>
        <a className="navItem" href="/policies">Policies</a>
      </nav>
      <div className="sidebarFoot">Self-hosted deployment</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">File records</p><h1>Files</h1><p className="subhead">A history of inspected attachments, organized by computer.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>
      <div className="inlineNote"><strong>Content privacy</strong><span>Original files and detected values remain on the endpoint. A policy may optionally share a short preview with detected values redacted.</span></div>
      <section className="panel">
        <div className="panelHead"><div><h2>Observed files</h2><p>{files.length} unique computer and filename records</p></div></div>
        <form className="search" onSubmit={(event) => event.preventDefault()}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, computer, service, or finding" aria-label="Search files" />
        </form>
        <div className="tableWrap"><table><thead><tr><th>File</th><th>Computer</th><th>Service</th><th>Findings</th><th>Policy result</th><th>Last seen</th></tr></thead>
          <tbody>{files.map((item) => <tr key={item.key} onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(item); }}>
            <td><div className="fileName">{item.name}</div><small>{item.extension || "file"} · {sizeLabel(item.size)} · {item.mime || "unknown type"}</small></td>
            <td>{item.device}</td><td><span className="provider">{item.provider}</span></td>
            <td><div className="tagList">{item.tags.length ? item.tags.map((tag) => <span className="tagChip" key={tag}>{tag.replace(/_/g, " ")}</span>) : <span className="muted">No matches</span>}</div></td>
            <td><span className={"statusText " + (item.outcome === "prevented" ? "statusBad" : item.tags.length ? "statusWarn" : "statusGood")}>{item.outcome === "prevented" ? "Browser blocked" : item.policy || "Allowed"}</span><small>{item.risk}/100 · {item.severity}</small></td>
            <td><span className="time">{new Date(item.lastSeen).toLocaleString()}</span></td>
          </tr>)}
          {files.length === 0 && <tr><td colSpan={6} className="empty">No file records yet. Connect an endpoint and inspect a supported file.</td></tr>}</tbody>
        </table></div>
        <div className="panelFoot">The inventory is derived from inspection events; it is not a file repository.</div>
      </section>

      {selected && <div className="overlay" onClick={() => setSelected(null)}>
        <section className="detail" onClick={(event) => event.stopPropagation()} aria-label="File details">
          <button className="close" onClick={() => setSelected(null)}>Close</button>
          <p className="eyebrow">File record</p><h2>{selected.name}</h2>
          <dl>
            <dt>Computer</dt><dd>{selected.device}</dd>
            <dt>Service</dt><dd>{selected.provider}</dd>
            <dt>File type</dt><dd>{selected.mime || selected.extension || "Unknown"}</dd>
            <dt>Size</dt><dd>{sizeLabel(selected.size)}</dd>
            <dt>Risk</dt><dd>{selected.risk}/100 · {selected.severity}</dd>
            <dt>Findings</dt><dd>{selected.tags.join(", ") || "None"}</dd>
            <dt>Policy</dt><dd>{selected.policy || "No matching policy"}</dd>
            <dt>Observations</dt><dd>{selected.observations}</dd>
            <dt>Last seen</dt><dd>{new Date(selected.lastSeen).toLocaleString()}</dd>
          </dl>
          {selected.preview ? <section className="previewPanel"><h3>Redacted document preview</h3><pre>{selected.preview}</pre><p>Detected values were removed before the preview left the endpoint.</p></section> :
            <p className="detailNote">No preview is available for this record. Enable redacted previews on a policy to share a limited excerpt after local masking.</p>}
        </section>
      </div>}
    </section>
  </main>;
}
