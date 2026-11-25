const NATIVE_HOST = "com.aegisai.agent";
const ALLOWED = new Set(["chatgpt.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "perplexity.ai", "grok.com"]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AEGIS_ATTACHMENT_SELECTED") return;
  let senderHost = "";
  try { senderHost = new URL(sender.url ?? "").hostname.toLowerCase(); } catch { return; }
  const domain = String(message.payload?.provider_domain ?? "");
  if (!ALLOWED.has(domain) || !(senderHost === domain || senderHost.endsWith("." + domain))) {
    sendResponse({ ok: false, error: "untrusted_sender" });
    return;
  }
  const file = message.payload?.file;
  if (!file || typeof file.name !== "string" || !Number.isSafeInteger(file.size_bytes) || file.size_bytes < 0) {
    sendResponse({ ok: false, error: "invalid_metadata" });
    return;
  }
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    let responded = false;
    port.onMessage.addListener((response) => {
      responded = true;
      sendResponse(response);
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      if (!responded) sendResponse({ ok: false, error: "native_host_unavailable" });
    });
    port.postMessage(message.payload);
    return true;
  } catch {
    sendResponse({ ok: false, error: "native_host_unavailable" });
  }
});
