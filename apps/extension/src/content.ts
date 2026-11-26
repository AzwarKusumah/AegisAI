import { providerForHost } from "./providers";

const CHUNK_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const segmentSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += segmentSize) {
    const segment = bytes.subarray(offset, Math.min(offset + segmentSize, bytes.length));
    binary += String.fromCharCode(...segment);
  }
  return btoa(binary);
}

function showInspectionAlert(fileName: string, inspection: {
  status?: string; risk_score?: number; severity?: string; categories?: string[];
}) {
  document.getElementById("aegisai-inspection-alert")?.remove();
  const root = document.createElement("div");
  root.id = "aegisai-inspection-alert";
  const shadow = root.attachShadow({ mode: "closed" });
  const severity = inspection.severity ?? "none";
  const risky = ["high", "critical"].includes(severity);
  const categories = (inspection.categories ?? []).slice(0, 8);
  const heading = risky ? "Sensitive data detected" : categories.length ? "Potentially sensitive data detected" : "Inspection complete";
  const card = document.createElement("section");
  card.style.setProperty("--alert-border", risky ? "#ef4444" : categories.length ? "#d97706" : "#0d9488");
  const style = document.createElement("style");
  style.textContent = [
    ":host{all:initial}",
    "section{position:fixed;z-index:2147483647;right:22px;bottom:22px;width:min(370px,calc(100vw - 32px));box-sizing:border-box;padding:17px;border:1px solid var(--alert-border);border-left:4px solid var(--alert-border);border-radius:12px;background:#101827;color:#edf3fb;box-shadow:0 18px 55px #0009;font:13px/1.5 Inter,Segoe UI,system-ui,sans-serif}",
    ".top{display:flex;align-items:center;justify-content:space-between;gap:12px}",
    "h2{font-size:14px;margin:0;font-weight:700}",
    ".tag{font-size:9px;text-transform:uppercase;letter-spacing:1px;padding:3px 7px;border-radius:20px;background:#263449;color:#f8fafc}",
    "p{font-size:11px;color:#b7c5d8;margin:9px 0 0;overflow-wrap:anywhere}",
    ".meta{display:flex;gap:12px;margin-top:12px;font-size:11px;color:#dce7f5}",
    ".categories{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}",
    ".chip{font-size:10px;padding:3px 7px;border-radius:5px;background:#263449;color:#d8e6f6}",
    "button{float:right;margin-top:12px;border:1px solid #41536b;border-radius:6px;padding:5px 10px;color:#edf3fb;background:#1c293d;cursor:pointer}",
    "button:focus-visible{outline:2px solid #67e8f9;outline-offset:2px}"
  ].join("\n");
  const top = document.createElement("div");
  top.className = "top";
  const title = document.createElement("h2");
  title.textContent = heading;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = severity;
  top.append(title, tag);
  const file = document.createElement("p");
  file.textContent = fileName;
  const detail = document.createElement("div");
  detail.className = "meta";
  const score = document.createElement("span");
  score.textContent = "Risk score: " + String(inspection.risk_score ?? 0) + "/100";
  const state = document.createElement("span");
  state.textContent = inspection.status === "completed" ? "Scan completed" : "Scan incomplete";
  detail.append(score, state);
  const chips = document.createElement("div");
  chips.className = "categories";
  for (const category of categories) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = category.replace(/_/g, " ");
    chips.append(chip);
  }
  const note = document.createElement("p");
  note.textContent = risky
    ? "Review this attachment before sending. AegisAI has not blocked the provider upload."
    : "This is an inspection result only. AegisAI has not blocked the provider upload.";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.addEventListener("click", () => root.remove());
  card.append(top, file, detail, chips, note, close);
  shadow.append(style, card);
  document.documentElement.append(root);
  window.setTimeout(() => root.remove(), 15000);
}

function inspectFile(file: File, providerDomain: string): Promise<void> {
  return new Promise((resolve) => {
    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_BYTES);
    const port = chrome.runtime.connect({ name: "aegisai-inspection" });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { port.disconnect(); } catch { /* already disconnected */ }
      resolve();
    };
    port.onMessage.addListener((message) => {
      if (message?.type === "inspection_result") {
        console.info("[AegisAI] Local inspection completed:", {
          event_id: message.event_id, status: message.inspection?.status,
          risk_score: message.inspection?.risk_score, severity: message.inspection?.severity
        });
        showInspectionAlert(file.name, message.inspection ?? {});
        finish();
      } else if (message?.type === "error") {
        console.warn("[AegisAI] Local inspection could not be completed.");
        showInspectionAlert(file.name, { status: "failed", severity: "none", risk_score: 0, categories: [] });
        finish();
      }
    });
    port.onDisconnect.addListener(finish);
    void (async () => {
      try {
        port.postMessage({
          type: "file_start", file_id: fileId, provider_domain: providerDomain,
          file_name: file.name.slice(0, 255), mime_type: file.type.slice(0, 127),
          size_bytes: file.size, total_chunks: totalChunks
        });
        for (let index = 0; index < totalChunks; index += 1) {
          const start = index * CHUNK_BYTES;
          const end = Math.min(start + CHUNK_BYTES, file.size);
          const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
          const encoded = toBase64(bytes);
          bytes.fill(0);
          port.postMessage({ type: "file_chunk", file_id: fileId, index, data_base64: encoded });
        }
        port.postMessage({ type: "file_end", file_id: fileId });
      } catch {
        console.warn("[AegisAI] Could not read or stream the selected file locally.");
        finish();
      }
    })();
  });
}

const provider = providerForHost(window.location.hostname);
if (provider) {
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file" || !target.files) return;
    const selectedFiles = Array.from(target.files);
    chrome.storage.local.get({ inspectionEnabled: false }, (settings) => {
      if (!settings.inspectionEnabled) return;
      void (async () => {
        for (const file of selectedFiles.slice(0, 5)) {
          if (file.size > MAX_FILE_BYTES) {
            console.warn("[AegisAI] File skipped: local inspection limit is 10 MiB.");
            continue;
          }
          await inspectFile(file, provider.domain);
        }
      })();
    });
  }, true);
}
