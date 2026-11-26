const NATIVE_HOST = "com.aegisai.agent";
const ALLOWED = new Set([
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "perplexity.ai",
  "grok.com"
]);

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [...ALLOWED].some((domain) => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

chrome.runtime.onConnect.addListener((contentPort) => {
  if (contentPort.name !== "aegisai-inspection") return;

  const senderUrl = contentPort.sender?.url ?? "";
  if (!hostAllowed(senderUrl)) {
    contentPort.disconnect();
    return;
  }

  let nativePort: chrome.runtime.Port;
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);
  } catch {
    contentPort.postMessage({ type: "error", code: "native_host_unavailable" });
    contentPort.disconnect();
    return;
  }

  let disconnected = false;
  const disconnectBoth = () => {
    if (disconnected) return;
    disconnected = true;
    try { nativePort.disconnect(); } catch { /* already closed */ }
    try { contentPort.disconnect(); } catch { /* already closed */ }
  };

  contentPort.onMessage.addListener((message) => {
    const type = message?.type;
    if (type !== "file_start" && type !== "file_chunk" && type !== "file_end" && type !== "enforcement_result") {
      contentPort.postMessage({ type: "error", code: "unsupported_message" });
      disconnectBoth();
      return;
    }
    try {
      nativePort.postMessage(message);
    } catch {
      contentPort.postMessage({ type: "error", code: "native_host_unavailable" });
      disconnectBoth();
    }
  });

  nativePort.onMessage.addListener((message) => {
    try {
      contentPort.postMessage(message);
    } catch {
      disconnectBoth();
    }
  });

  nativePort.onDisconnect.addListener(() => {
    if (!disconnected) {
      try {
        contentPort.postMessage({ type: "error", code: "native_host_disconnected" });
      } catch { /* content port is already closed */ }
      disconnectBoth();
    }
  });

  contentPort.onDisconnect.addListener(disconnectBoth);
});
