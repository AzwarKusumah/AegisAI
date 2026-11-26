"use client";

import { useCallback, useEffect, useState } from "react";
import type { DlpPolicy } from "../../lib/types";

const emptyPolicy: DlpPolicy = {
  id: "",
  name: "",
  description: "",
  enabled: true,
  priority: 100,
  action: "block",
  min_severity: "high",
  min_risk_score: 60,
  categories: ["cloud_credential", "private_key", "source_control_credential", "credential"],
  providers: [],
  extensions: [],
  fingerprints: [],
  exceptions: [],
  share_redacted_preview: false
};

const categories = [
  ["cloud_credential", "Cloud credentials"],
  ["private_key", "Private keys"],
  ["source_control_credential", "Source-control tokens"],
  ["credential", "Credential assignments"],
  ["payment_card", "Payment card numbers"],
  ["national_identifier", "National identifiers"],
  ["email", "Email addresses"],
  ["phone", "Phone numbers"]
] as const;

const services = ["chatgpt", "claude", "gemini", "copilot", "perplexity", "grok"];

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<DlpPolicy[]>([]);
  const [status, setStatus] = useState("Loading policies");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DlpPolicy | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("Loading policies");
    try {
      const response = await fetch("/api/policies", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load policies");
      setPolicies(data.policies ?? []);
      setStatus("Connected");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Control plane unavailable");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function beginCreate() {
    setError("");
    setIsNew(true);
    setEditing({ ...emptyPolicy, categories: [...emptyPolicy.categories] });
  }
  function beginEdit(policy: DlpPolicy) {
    setError("");
    setIsNew(false);
    setEditing({ ...policy, categories: [...policy.categories], providers: [...policy.providers], extensions: [...policy.extensions], fingerprints: [...(policy.fingerprints ?? [])], exceptions: (policy.exceptions ?? []).map((item) => ({ ...item, categories: [...item.categories], providers: [...item.providers], extensions: [...item.extensions], fingerprints: [...(item.fingerprints ?? [])] })) });
  }
  function toggleListValue(key: "categories" | "providers", value: string) {
    if (!editing) return;
    const values = editing[key];
    setEditing({ ...editing, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  }
  function updateException(field: "name" | "action" | "categories" | "providers" | "extensions" | "fingerprints", value: string) {
    if (!editing) return;
    const current = editing.exceptions[0] ?? { name: "Approved exception", action: "allow" as const, categories: [], providers: [], extensions: [], fingerprints: [] };
    let next = current;
    if (field === "name") next = { ...current, name: value };
    else if (field === "action") next = { ...current, action: value as "block" | "audit" | "allow" };
    else if (field === "categories") next = { ...current, categories: value.split(",").map((item) => item.trim()).filter(Boolean) };
    else if (field === "providers") next = { ...current, providers: value.split(",").map((item) => item.trim()).filter(Boolean) };
    else if (field === "extensions") next = { ...current, extensions: value.split(",").map((item) => item.trim()).filter(Boolean) };
    else next = { ...current, fingerprints: value.split(",").map((item) => item.trim()).filter(Boolean) };
    setEditing({ ...editing, exceptions: [next] });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    const payload = {
      ...editing,
      id: isNew ? "policy-" + crypto.randomUUID() : editing.id,
      priority: Number(editing.priority),
      min_risk_score: Number(editing.min_risk_score),
      extensions: editing.extensions.map((item) => item.trim().replace(/^\./, "").toLowerCase()).filter(Boolean),
      fingerprints: editing.fingerprints.map((item) => item.trim().toLowerCase()).filter(Boolean),
      exceptions: editing.exceptions.map((item) => ({
        ...item,
        action: item.action || "allow",
        extensions: item.extensions.map((value) => value.trim().replace(/^\./, "").toLowerCase()).filter(Boolean),
        fingerprints: item.fingerprints.map((value) => value.trim().toLowerCase()).filter(Boolean)
      }))
    };
    try {
      const response = await fetch(isNew ? "/api/policies" : "/api/policies/" + encodeURIComponent(editing.id), {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save policy");
      setEditing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save policy");
    } finally {
      setBusy(false);
    }
  }
  async function remove(policy: DlpPolicy) {
    if (!window.confirm("Delete the policy “" + policy.name + "”?")) return;
    try {
      const response = await fetch("/api/policies/" + encodeURIComponent(policy.id), { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete policy");
      await load();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not delete policy");
    }
  }

  return <main className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brandMark">A</span><span>AegisAI<small>Data protection</small></span></a>
      <nav className="navGroup" aria-label="Main navigation">
        <a className="navItem" href="/">Activity</a>
        <a className="navItem" href="/files">Files</a>
        <a className="navItem" href="/devices">Devices</a>
        <a className="navItem active" href="/policies" aria-current="page">Policies</a>
      </nav>
      <div className="sidebarFoot">Self-hosted deployment</div>
      <form action="/api/auth/logout" method="post"><button className="logoutButton">Sign out</button></form>
    </aside>
    <section className="content">
      <header className="topbar">
        <div><p className="eyebrow">Data controls</p><h1>Policies</h1><p className="subhead">Set which files can be shared with supported AI services.</p></div>
        <div className={"connection " + (status === "Connected" ? "online" : "offline")}><i />{status}</div>
      </header>
      <div className="inlineNote"><strong>Evaluation order</strong><span>Policies are evaluated from the lowest priority number upward. The first matching rule decides: block stops the attachment, audit records it, and allow permits it. Inspection failures are blocked when the policy service is configured fail-closed.</span></div>
      <section className="panel">
        <div className="panelHead">
          <div><h2>Active policy set</h2><p>{policies.filter((policy) => policy.enabled).length} enabled of {policies.length} policies</p></div>
          <div className="buttonGroup">
            <button className="button buttonSecondary" onClick={() => void load()}>Refresh</button>
            <button className="button buttonPrimary" onClick={beginCreate}>New policy</button>
          </div>
        </div>
        <div className="policyList">
          {policies.map((policy) => <article className="policyRow" key={policy.id}>
            <div className="policyMain">
              <div className="policyNameLine">
                <h3>{policy.name}</h3>
                <span className={"actionBadge action" + policy.action}>{policy.action}</span>
                {!policy.enabled && <span className="statusText statusMuted">Disabled</span>}
              </div>
              <p>{policy.description}</p>
              <div className="policyMeta">
                <span>Priority {policy.priority}</span>
                <span>Severity ≥ {policy.min_severity || "any"}</span>
                <span>Risk ≥ {policy.min_risk_score}</span>
                <span>{policy.categories.length ? policy.categories.length + " classifiers" : "Any category"}</span>
              </div>
            </div>
            <div className="policyActions">
              <button className="button buttonSecondary" onClick={() => beginEdit(policy)}>Edit</button>
              <button className="button buttonDanger" onClick={() => void remove(policy)}>Delete</button>
            </div>
          </article>)}
          {policies.length === 0 && <div className="empty">No policies found. Add a policy to define how attachments are handled.</div>}
        </div>
        <div className="panelFoot">Policies are stored on the Control Plane and distributed to enrolled endpoints. Changes apply when the Agent retrieves the next policy set.</div>
      </section>
      {editing && <div className="overlay" onClick={() => setEditing(null)}>
        <section className="policyEditor" onClick={(event) => event.stopPropagation()} aria-label="Policy editor">
          <div className="editorHeader">
            <div><p className="eyebrow">{isNew ? "New rule" : "Policy settings"}</p><h2>{isNew ? "Create policy" : "Edit policy"}</h2></div>
            <button className="close" onClick={() => setEditing(null)}>Close</button>
          </div>
          <div className="editorBody">
            <label className="fieldGroup"><span>Policy name</span><input className="control" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} maxLength={120} /></label>
            <label className="fieldGroup"><span>Description</span><textarea className="control" rows={2} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} maxLength={1000} /></label>
            <div className="formGrid">
              <label className="fieldGroup"><span>Action</span><select className="control" value={editing.action} onChange={(event) => setEditing({ ...editing, action: event.target.value as DlpPolicy["action"] })}>
                <option value="block">Block attachment</option><option value="audit">Allow and audit</option><option value="allow">Allow upload</option>
              </select></label>
              <label className="fieldGroup"><span>Priority (lower runs first)</span><input className="control" type="number" min={0} max={10000} value={editing.priority} onChange={(event) => setEditing({ ...editing, priority: Number(event.target.value) })} /></label>
              <label className="fieldGroup"><span>Minimum severity</span><select className="control" value={editing.min_severity} onChange={(event) => setEditing({ ...editing, min_severity: event.target.value })}>
                {["none", "low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <label className="fieldGroup"><span>Minimum risk score</span><input className="control" type="number" min={0} max={100} value={editing.min_risk_score} onChange={(event) => setEditing({ ...editing, min_risk_score: Number(event.target.value) })} /></label>
            </div>

            <div className="fieldGroup"><span>Content classifiers</span><p className="fieldHelp">Select one or more types of sensitive content. Leave empty to match any category.</p>
              <div className="choiceGrid">{categories.map(([value, label]) => <label className="choice" key={value}><input type="checkbox" checked={editing.categories.includes(value)} onChange={() => toggleListValue("categories", value)} /><span>{label}</span></label>)}</div>
            </div>
            <div className="fieldGroup"><span>AI services</span><p className="fieldHelp">Leave all unchecked to apply across every supported service.</p>
              <div className="choiceGrid">{services.map((value) => <label className="choice" key={value}><input type="checkbox" checked={editing.providers.includes(value)} onChange={() => toggleListValue("providers", value)} /><span>{value}</span></label>)}</div>
            </div>
            <label className="fieldGroup"><span>File extensions (comma-separated)</span><input className="control" placeholder="pdf, docx, xlsx" value={editing.extensions.join(", ")} onChange={(event) => setEditing({ ...editing, extensions: event.target.value.split(",") })} /></label>
            <label className="fieldGroup"><span>Exact file fingerprints · SHA-256</span><textarea className="control" rows={2} placeholder="One 64-character SHA-256 per entry, comma-separated" value={editing.fingerprints.join(", ")} onChange={(event) => setEditing({ ...editing, fingerprints: event.target.value.split(",") })} /></label>
            <div className="fieldGroup">
              <span>Exceptions</span>
              <p className="fieldHelp">Exceptions are evaluated only after the parent policy matches. Set an explicit outcome for the matching exception.</p>
              <label className="fieldGroup"><span>Exception name</span><input className="control" value={editing.exceptions[0]?.name ?? ""} onChange={(event) => updateException("name", event.target.value)} placeholder="Approved workspace" /></label>
              <label className="fieldGroup"><span>Exception action</span><select className="control" value={editing.exceptions[0]?.action ?? "allow"} onChange={(event) => updateException("action", event.target.value)}><option value="allow">Allow this exception</option><option value="audit">Allow and audit</option><option value="block">Block this exception</option></select></label>
              <label className="fieldGroup"><span>Exclude categories (comma-separated)</span><input className="control" value={editing.exceptions[0]?.categories.join(", ") ?? ""} onChange={(event) => updateException("categories", event.target.value)} placeholder="email, phone" /></label>
              <label className="fieldGroup"><span>Exclude services (comma-separated)</span><input className="control" value={editing.exceptions[0]?.providers.join(", ") ?? ""} onChange={(event) => updateException("providers", event.target.value)} placeholder="chatgpt, claude" /></label>
              <label className="fieldGroup"><span>Exclude extensions (comma-separated)</span><input className="control" value={editing.exceptions[0]?.extensions.join(", ") ?? ""} onChange={(event) => updateException("extensions", event.target.value)} placeholder="pdf, docx" /></label>
              <label className="fieldGroup"><span>Exclude file fingerprints (SHA-256)</span><textarea className="control" rows={2} value={editing.exceptions[0]?.fingerprints.join(", ") ?? ""} onChange={(event) => updateException("fingerprints", event.target.value)} placeholder="Approved file SHA-256 values" /></label>
            </div>
            <label className="choice"><input type="checkbox" checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} /><span>Policy enabled</span></label>
            <label className="choice"><input type="checkbox" checked={editing.share_redacted_preview} onChange={(event) => setEditing({ ...editing, share_redacted_preview: event.target.checked })} /><span>Share a short document preview after detected values are redacted</span></label>
            <p className="fieldHelp">The original file and unredacted match values stay on the endpoint. Redacted previews may still contain other confidential context; enable only when permitted by your data-handling policy.</p>
            {error && <p className="formError" role="alert">{error}</p>}
          </div>
          <div className="editorFooter">
            <button className="button buttonSecondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="button buttonPrimary" disabled={busy || !editing.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save policy"}</button>
          </div>
        </section>
      </div>}
    </section>
  </main>;
}
