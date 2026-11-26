import { providerForHost } from "./providers";

const CHUNK_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const pendingFileInputs = new WeakSet<HTMLInputElement>();
const replayingInput = new WeakSet<HTMLInputElement>();
const replayingChange = new WeakSet<HTMLInputElement>();
const allowedDrops = new WeakSet<EventTarget>();
const allowedPastes = new WeakSet<EventTarget>();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const segmentSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += segmentSize) {
    const segment = bytes.subarray(offset, Math.min(offset + segmentSize, bytes.length));
    binary += String.fromCharCode(...segment);
  }
  return btoa(binary);
}

function showNotice(title: string, message: string, blocked: boolean) {
  document.getElementById("aegisai-policy-notice")?.remove();
  const root = document.createElement("div");
  root.id = "aegisai-policy-notice";
  const shadow = root.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial}
    section{position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:16px 18px;border:1px solid ${blocked ? "#b85c51" : "#a8b1ad"};border-left:3px solid ${blocked ? "#b85c51" : "#456d60"};background:#fbfbf8;color:#202824;box-shadow:0 12px 34px #18231d22;font:14px/1.5 "Segoe UI",Arial,sans-serif}
    .heading{display:flex;align-items:center;gap:9px;font-weight:650;font-size:14px}
    .dot{width:8px;height:8px;border-radius:50%;background:${blocked ? "#b85c51" : "#456d60"}}
    p{margin:7px 0 0;color:#5c6660;font-size:12px;overflow-wrap:anywhere}
    button{margin-top:12px;padding:6px 10px;border:1px solid #c8cfca;background:transparent;color:#202824;font:inherit;font-size:12px;cursor:pointer}
    button:focus-visible{outline:2px solid #456d60;outline-offset:2px}
  `;
  const card = document.createElement("section");
  const heading = document.createElement("div");
  heading.className = "heading";
  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.textContent = title;
  heading.append(dot, label);
  const detail = document.createElement("p");
  detail.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => root.remove());
  card.append(heading, detail, close);
  shadow.append(style, card);
  document.documentElement.append(root);
  window.setTimeout(() => root.remove(), 12000);
}

function inspectFile(file: File, providerDomain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const fileId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_BYTES);
    let settled = false;
    let blocked = true;
    let enforcementSent = false;
    const port = chrome.runtime.connect({ name: "aegisai-inspection" });
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      try { port.disconnect(); } catch { /* port already closed */ }
      resolve(result);
    };

    port.onMessage.addListener((message) => {
      if (message?.type === "inspection_result") {
        const decision = message.decision;
        blocked = !decision || decision.action === "block" ||
          (decision.action !== "allow" && decision.action !== "audit");
        const reason = decision?.reason === "policy_service_unavailable"
          ? "The policy service could not be reached. The file was kept in the browser."
          : decision?.reason === "inspection_failed_fail_closed"
            ? "The document could not be inspected. The active policy keeps uninspected files from being sent."
            : decision?.policy_name
              ? "Matched policy: " + String(decision.policy_name)
              : "No blocking policy matched this file.";
        if (blocked) showNotice("Upload stopped by policy", file.name + " · " + reason, true);
        else if (decision?.action === "audit") showNotice("File checked", file.name + " · Recorded for review; upload may continue.", false);
        try {
          port.postMessage({ type: "enforcement_result", file_id: fileId, blocked });
          enforcementSent = true;
        } catch {
          finish(true);
        }
      } else if (message?.type === "enforcement_recorded") {
        finish(blocked);
      } else if (message?.type === "error") {
        showNotice("Upload stopped", "Local inspection could not complete. The file was not passed to the page.", true);
        finish(true);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        if (!enforcementSent) showNotice("Upload stopped", "The local inspection agent disconnected. The file was not passed to the page.", true);
        finish(true);
      }
    });

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
        showNotice("Upload stopped", "The file could not be read for local inspection.", true);
        finish(true);
      }
    })();
  });
}

async function inspectFiles(files: File[], providerDomain: string): Promise<boolean> {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      showNotice("Upload stopped", file.name + " exceeds the 10 MiB local inspection limit.", true);
      return true;
    }
    if (await inspectFile(file, providerDomain)) return true;
  }
  return false;
}

const provider = providerForHost(window.location.hostname);
if (provider) {
  const gateFileInputEvent = (event: Event, input: HTMLInputElement, eventType: "input" | "change") => {
    const replayed = eventType === "input" ? replayingInput : replayingChange;
    if (replayed.delete(input)) return;
    if (pendingFileInputs.has(input)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;

    // Hold both standard file-input events until local inspection and policy evaluation finish.
    pendingFileInputs.add(input);
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      const blocked = await inspectFiles(files, provider.domain);
      pendingFileInputs.delete(input);
      const currentFiles = input.files ? Array.from(input.files) : [];
      const selectionChanged = currentFiles.length !== files.length ||
        currentFiles.some((file, index) => file !== files[index]);
      if (blocked || selectionChanged) {
        if (selectionChanged) {
          showNotice("Attachment selection changed", "The selected files changed during inspection. Select them again so the new files can be checked.", true);
        }
        input.value = "";
        return;
      }
      replayingInput.add(input);
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      replayingChange.add(input);
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    })();
  };

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    gateFileInputEvent(event, input, "input");
  }, true);

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    gateFileInputEvent(event, input, "change");
  }, true);

  document.addEventListener("drop", (event) => {
    const target = event.target;
    const transfer = (event as DragEvent).dataTransfer;
    const files = transfer ? Array.from(transfer.files) : [];
    if (!target || !files.length) return;
    if (allowedDrops.has(target)) {
      allowedDrops.delete(target);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      if (await inspectFiles(files, provider.domain)) return;
      const replayTransfer = new DataTransfer();
      for (const file of files) replayTransfer.items.add(file);
      allowedDrops.add(target);
      target.dispatchEvent(new DragEvent("drop", {
        bubbles: true, cancelable: true, dataTransfer: replayTransfer
      }));
    })();
  }, true);

  document.addEventListener("paste", (event) => {
    const target = event.target;
    const clipboard = (event as ClipboardEvent).clipboardData;
    const files = clipboard ? Array.from(clipboard.files) : [];
    if (!target || !files.length) return;
    if (allowedPastes.has(target)) {
      allowedPastes.delete(target);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      if (await inspectFiles(files, provider.domain)) return;
      const replayTransfer = new DataTransfer();
      for (const file of files) replayTransfer.items.add(file);
      allowedPastes.add(target);
      target.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: replayTransfer
      }));
    })();
  }, true);
}
