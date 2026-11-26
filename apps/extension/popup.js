const title = document.getElementById("stateTitle");
const message = document.getElementById("stateMessage");
const dot = document.getElementById("stateDot");

function render(state, controlPlane) {
  dot.className = "state-dot";
  if (state === "ready" && controlPlane === "connected") {
    dot.classList.add("stateReady");
    title.textContent = "Protection ready";
    message.textContent = "The local Agent is installed and connected. Supported attachments are inspected automatically.";
    return;
  }
  if (state === "limited") {
    dot.classList.add("stateLimited");
    title.textContent = "Protection limited";
    message.textContent = "The local Agent is available, but the Control Plane is unreachable. Uploads on supported pages remain blocked until policy inspection can complete.";
    return;
  }
  if (state === "setup_required") {
    dot.classList.add("stateError");
    title.textContent = "Setup required";
    message.textContent = "The local Agent is not fully configured. Run the AegisAI Windows installer and enroll this device.";
    return;
  }
  dot.classList.add("stateError");
  title.textContent = "Agent unavailable";
  message.textContent = "The browser could not contact the local AegisAI Agent. Check that it is installed and restart the browser.";
}

try {
  chrome.runtime.sendNativeMessage("com.aegisai.agent", { type: "status" }, (response) => {
    if (chrome.runtime.lastError) {
      render("unavailable", "unreachable");
      return;
    }
    if (!response || response.type !== "agent_status") {
      render("unavailable", "unreachable");
      return;
    }
    render(response.state, response.control_plane);
  });
} catch {
  render("unavailable", "unreachable");
}
