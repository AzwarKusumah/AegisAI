import { providerForHost } from "./providers";

const provider = providerForHost(window.location.hostname);
if (provider) {
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file" || !target.files) return;
    for (const file of Array.from(target.files).slice(0, 20)) {
      chrome.runtime.sendMessage({
        type: "AEGIS_ATTACHMENT_SELECTED",
        payload: {
          provider: provider.id,
          provider_domain: provider.domain,
          event_type: "attachment_selected",
          file: {
            name: file.name.slice(0, 255),
            mime_type: file.type.slice(0, 127),
            size_bytes: file.size
          }
        }
      });
    }
  }, true);
}
