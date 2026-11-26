#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
AegisAI Native Messaging installer (Linux/macOS)

Usage:
  ./install-unix.sh --browser chrome --extension-id EXTENSION_ID
  ./install-unix.sh --browser edge --extension-id EXTENSION_ID
  ./install-unix.sh --browser chromium --extension-id EXTENSION_ID
  ./install-unix.sh --browser brave --extension-id EXTENSION_ID
  ./install-unix.sh --browser firefox

Optional:
  --control-plane-url URL
  --agent-token TOKEN
  --help
EOF
}

BROWSER=""
EXTENSION_ID=""
CONTROL_PLANE_URL=""
AGENT_TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser) BROWSER="${2:-}"; shift 2 ;;
    --extension-id) EXTENSION_ID="${2:-}"; shift 2 ;;
    --control-plane-url) CONTROL_PLANE_URL="${2:-}"; shift 2 ;;
    --agent-token) AGENT_TOKEN="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$BROWSER" =~ ^(chrome|chromium|brave|edge|firefox)$ ]] || {
  echo "Choose a browser: chrome, chromium, brave, edge, or firefox." >&2
  exit 2
}
if [[ "$BROWSER" != "firefox" ]]; then
  [[ "$EXTENSION_ID" =~ ^[a-p]{32}$ ]] || {
    echo "A valid Chromium extension ID (32 characters a-p) is required." >&2
    exit 2
  }
fi

command -v python3 >/dev/null 2>&1 || { echo "Python 3.11+ is required." >&2; exit 1; }
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)' || {
  echo "Python 3.11+ is required for the local detection engine." >&2
  exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BINARY_SOURCE="$SCRIPT_DIR/aegisai-agent"
ENGINE_SOURCE="$SCRIPT_DIR/engine"
[[ -x "$BINARY_SOURCE" ]] || { echo "Agent binary not found: $BINARY_SOURCE" >&2; exit 1; }
[[ -f "$ENGINE_SOURCE/pyproject.toml" ]] || { echo "Bundled Python engine not found: $ENGINE_SOURCE" >&2; exit 1; }

if [[ "$(uname -s)" == "Darwin" ]]; then
  DATA_HOME="$HOME/Library/Application Support"
  CONFIG_HOME="$HOME/Library/Application Support"
else
  DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
  CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
fi

INSTALL_DIR="$DATA_HOME/AegisAI"
CONFIG_DIR="$CONFIG_HOME/AegisAI"
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
chmod 700 "$INSTALL_DIR" "$CONFIG_DIR"

install -m 0755 "$BINARY_SOURCE" "$INSTALL_DIR/aegisai-agent"
rm -rf "$INSTALL_DIR/engine"
cp -R "$ENGINE_SOURCE" "$INSTALL_DIR/engine"
chmod -R go-rwx "$INSTALL_DIR/engine"

python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/python" -m pip install --disable-pip-version-check -e "$INSTALL_DIR/engine[documents]"

AGENT_PATH="$INSTALL_DIR/aegisai-agent"
ENGINE_PATH="$INSTALL_DIR/engine"
PYTHON_PATH="$INSTALL_DIR/.venv/bin/python"
EXTENSION_ORIGIN=""
if [[ "$BROWSER" != "firefox" ]]; then
  EXTENSION_ORIGIN="chrome-extension://$EXTENSION_ID/"
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  case "$BROWSER" in
    chrome) HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    chromium) HOST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
    brave) HOST_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    edge) HOST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" ;;
    firefox) HOST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts" ;;
  esac
else
  case "$BROWSER" in
    chrome) HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
    chromium) HOST_DIR="$HOME/.config/chromium/NativeMessagingHosts" ;;
    brave) HOST_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    edge) HOST_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts" ;;
    firefox) HOST_DIR="$HOME/.mozilla/native-messaging-hosts" ;;
  esac
fi

mkdir -p "$HOST_DIR"
chmod 700 "$HOST_DIR"
HOST_MANIFEST="$HOST_DIR/com.aegisai.agent.json"
# Firefox passes the registered manifest path to the host. Keep the canonical
# file in dirs::data_local_dir()/AegisAI and register a symlink to that path.
CANONICAL_MANIFEST="$INSTALL_DIR/com.aegisai.agent.json"
if [[ "$BROWSER" == "firefox" ]]; then
  python3 - "$CANONICAL_MANIFEST" "$AGENT_PATH" <<'PY'
import json, os, sys
path, binary = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "name": "com.aegisai.agent",
        "description": "AegisAI local AI attachment inspection host",
        "path": binary,
        "type": "stdio",
        "allowed_extensions": ["aegisai@example.invalid"]
    }, handle, indent=2)
    handle.write("\n")
os.chmod(path, 0o600)
PY
else
  python3 - "$CANONICAL_MANIFEST" "$AGENT_PATH" "$EXTENSION_ORIGIN" <<'PY'
import json, os, sys
path, binary, origin = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "name": "com.aegisai.agent",
        "description": "AegisAI local AI attachment inspection host",
        "path": binary,
        "type": "stdio",
        "allowed_origins": [origin]
    }, handle, indent=2)
    handle.write("\n")
os.chmod(path, 0o600)
PY
fi
ln -sfn "$CANONICAL_MANIFEST" "$HOST_MANIFEST"

AEGIS_CFG_ENGINE="$ENGINE_PATH" \
AEGIS_CFG_PYTHON="$PYTHON_PATH" \
AEGIS_CFG_ORIGIN="$EXTENSION_ORIGIN" \
AEGIS_CFG_CONTROL_URL="$CONTROL_PLANE_URL" \
AEGIS_CFG_AGENT_TOKEN="$AGENT_TOKEN" \
python3 - "$CONFIG_DIR/config.json" <<'PY'
import json, os, sys
path = sys.argv[1]
config = {}
if os.path.isfile(path):
    try:
        with open(path, encoding="utf-8") as handle:
            config = json.load(handle)
    except (OSError, json.JSONDecodeError):
        raise SystemExit("Existing AegisAI config is invalid; back it up and fix it before reinstalling.")
config.update({
    "engine_path": os.environ["AEGIS_CFG_ENGINE"],
    "python": os.environ["AEGIS_CFG_PYTHON"],
    "extension_origins": os.environ["AEGIS_CFG_ORIGIN"]
})
if os.environ["AEGIS_CFG_CONTROL_URL"]:
    config["control_plane_url"] = os.environ["AEGIS_CFG_CONTROL_URL"]
if os.environ["AEGIS_CFG_AGENT_TOKEN"]:
    config["agent_token"] = os.environ["AEGIS_CFG_AGENT_TOKEN"]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
os.chmod(path, 0o600)
PY

printf '\nAegisAI agent installed for %s.\n' "$BROWSER"
printf 'Agent:    %s\n' "$AGENT_PATH"
printf 'Engine:   %s\n' "$ENGINE_PATH"
printf 'Manifest: %s\n' "$HOST_MANIFEST"
printf 'Config:   %s/config.json\n' "$CONFIG_DIR"
printf 'Restart the browser to load the Native Messaging host.\n'
if [[ "$BROWSER" == "firefox" ]]; then
  echo "Firefox add-on ID must remain aegisai@example.invalid."
fi
