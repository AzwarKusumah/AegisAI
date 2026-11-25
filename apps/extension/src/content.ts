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
        // The response contains only event/inspection metadata. Never render file text.
        console.info("[AegisAI] Local inspection completed:", {
          event_id: message.event_id,
          status: message.inspection?.status,
          risk_score: message.inspection?.risk_score,
          severity: message.inspection?.severity
        });
        finish();
      } else if (message?.type === "error") {
        console.warn("[AegisAI] Local inspection could not be completed.");
        finish();
      }
    });
    port.onDisconnect.addListener(finish);

    void (async () => {
      try {
        port.postMessage({
          type: "file_start",
          file_id: fileId,
          provider_domain: providerDomain,
          file_name: file.name.slice(0, 255),
          mime_type: file.type.slice(0, 127),
          size_bytes: file.size,
          total_chunks: totalChunks
        });

        for (let index = 0; index < totalChunks; index += 1) {
          const start = index * CHUNK_BYTES;
          const end = Math.min(start + CHUNK_BYTES, file.size);
          const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
          port.postMessage({
            type: "file_chunk",
            file_id: fileId,
            index,
            data_base64: toBase64(bytes)
          });
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

    // Reading file content is explicitly opt-in through the extension popup.
    chrome.storage.local.get({ inspectionEnabled: false }, (settings) => {
      if (!settings.inspectionEnabled) return;

      for (const file of Array.from(target.files).slice(0, 5)) {
        if (file.size > MAX_FILE_BYTES) {
          console.warn("[AegisAI] File skipped: local inspection limit is 10 MiB.");
          continue;
        }
        void inspectFile(file, provider.domain);
      }
    });
  }, true);
}
