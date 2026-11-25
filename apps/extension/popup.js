const toggle = document.getElementById("enabled");
const status = document.getElementById("status");

chrome.storage.local.get({ inspectionEnabled: false }, (settings) => {
  toggle.checked = Boolean(settings.inspectionEnabled);
  status.textContent = toggle.checked ? "Local inspection is enabled." : "Local inspection is disabled.";
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ inspectionEnabled: enabled }, () => {
    status.textContent = enabled ? "Local inspection enabled." : "Local inspection disabled.";
  });
});
