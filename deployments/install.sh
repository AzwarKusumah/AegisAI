#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
MODE=""

usage() {
  cat <<'EOF'
AegisAI setup

Usage:
  ./deployments/install.sh                  # interactive setup
  ./deployments/install.sh --mode docker    # Docker Compose deployment
  sudo ./deployments/install.sh --mode systemd

Modes:
  docker   Build and start PostgreSQL, Go control plane, and dashboard containers.
  systemd  Build/install the Go API and Next.js dashboard as native systemd services.
           Requires Linux, systemd, Go >= 1.23, Node.js >= 20, npm, and PostgreSQL.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$MODE" ]]; then
  printf '\nAegisAI deployment setup\n\n'
  printf '  1) Docker Compose  (recommended for a quick start)\n'
  printf '  2) systemd         (native Linux services)\n\n'
  read -r -p 'Choose deployment [1/2]: ' choice
  case "$choice" in
    1) MODE="docker" ;;
    2) MODE="systemd" ;;
    *) echo "Invalid choice." >&2; exit 2 ;;
  esac
fi

if [[ "$MODE" != "docker" && "$MODE" != "systemd" ]]; then
  echo "Mode must be docker or systemd." >&2
  exit 2
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

read_env() {
  local key="$1"
  local value=""
  if [[ -f "$ENV_FILE" ]]; then
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  fi
  printf '%s' "$value"
}

write_env_if_missing() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "Using existing $ENV_FILE"
    return
  fi

  require_cmd openssl
  local db_password agent_token admin_token dashboard_password
  db_password="$(openssl rand -hex 24)"
  agent_token="$(openssl rand -hex 32)"
  admin_token="$(openssl rand -hex 32)"
  dashboard_password="$(openssl rand -hex 24)"

  umask 077
  cat > "$ENV_FILE" <<EOF
POSTGRES_DB=aegisai
POSTGRES_USER=aegisai
POSTGRES_PASSWORD=$db_password
DATABASE_URL=postgres://aegisai:$db_password@127.0.0.1:5432/aegisai?sslmode=disable
AEGIS_AGENT_TOKEN=$agent_token
AEGIS_ADMIN_TOKEN=$admin_token
AEGIS_LISTEN_ADDR=127.0.0.1:8787
AEGIS_API_URL=http://127.0.0.1:8787
AEGIS_DASHBOARD_USER=admin
AEGIS_DASHBOARD_PASSWORD=$dashboard_password
AEGIS_DASHBOARD_PORT=3000
EOF
  chmod 600 "$ENV_FILE"
  printf '\nCreated %s with random credentials.\n' "$ENV_FILE"
  printf 'Dashboard username: admin\nDashboard password: %s\n\n' "$dashboard_password"
  echo "Save the dashboard password now. The setup script will not print it again."
}

validate_env() {
  local key value
  for key in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD AEGIS_AGENT_TOKEN AEGIS_ADMIN_TOKEN AEGIS_DASHBOARD_USER AEGIS_DASHBOARD_PASSWORD; do
    value="$(read_env "$key")"
    if [[ -z "$value" || "$value" == *"replace-"* || "$value" == *"change-this-"* || "$value" == *"generate-a-"* ]]; then
      echo "Missing or placeholder value for $key in $ENV_FILE" >&2
      exit 1
    fi
  done
  if [[ "$(read_env POSTGRES_DB)" != "aegisai" || "$(read_env POSTGRES_USER)" != "aegisai" ]]; then
    echo "The systemd bootstrap currently expects POSTGRES_DB and POSTGRES_USER to be aegisai." >&2
    exit 1
  fi
}

setup_docker() {
  require_cmd docker
  docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is required (docker compose)." >&2; exit 1; }
  write_env_if_missing
  validate_env
  docker compose --env-file "$ENV_FILE" -f "$ROOT/deployments/compose/docker-compose.yml" config --quiet
  docker compose --env-file "$ENV_FILE" -f "$ROOT/deployments/compose/docker-compose.yml" up -d --build
  printf '\nAegisAI is starting. Dashboard: http://127.0.0.1:%s\n' "$(read_env AEGIS_DASHBOARD_PORT)"
  echo "Check status with: docker compose --env-file .env -f deployments/compose/docker-compose.yml ps"
}

version_at_least() {
  local actual="$1" minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$actual" | sort -V | head -n1)" == "$minimum" ]]
}

setup_systemd() {
  [[ "$(uname -s)" == "Linux" ]] || { echo "systemd deployment is Linux-only." >&2; exit 1; }
  [[ "$EUID" -eq 0 ]] || { echo "Run systemd setup with sudo." >&2; exit 1; }
  require_cmd systemctl
  require_cmd go
  require_cmd node
  require_cmd npm
  require_cmd runuser
  require_cmd psql
  require_cmd pg_isready
  require_cmd openssl

  local go_version node_version db_password role_exists database_exists
  go_version="$(go version | awk '{print $3}' | sed 's/^go//')"
  node_version="$(node --version | sed 's/^v//')"
  version_at_least "$go_version" "1.23" || { echo "Go >= 1.23 is required (found $go_version)." >&2; exit 1; }
  version_at_least "$node_version" "20.0.0" || { echo "Node.js >= 20 is required (found $node_version)." >&2; exit 1; }

  write_env_if_missing
  validate_env
  db_password="$(read_env POSTGRES_PASSWORD)"
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null || {
    echo "PostgreSQL is not accepting TCP connections on 127.0.0.1:5432." >&2
    echo "Install/start PostgreSQL and enable local TCP password authentication, then rerun." >&2
    exit 1
  }

  role_exists="$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='aegisai'")"
  if [[ "$role_exists" == "1" ]]; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v dbpass="$db_password" -c "ALTER ROLE aegisai WITH LOGIN PASSWORD :'dbpass';"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -v dbpass="$db_password" -c "CREATE ROLE aegisai LOGIN PASSWORD :'dbpass';"
  fi
  database_exists="$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='aegisai'")"
  if [[ "$database_exists" != "1" ]]; then
    runuser -u postgres -- createdb --owner=aegisai aegisai
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE aegisai OWNER TO aegisai;"
  fi

  if ! id aegisai >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/aegisai --create-home --shell /usr/sbin/nologin aegisai
  fi

  install -d -o root -g aegisai -m 0750 /etc/aegisai
  install -o root -g aegisai -m 0640 "$ENV_FILE" /etc/aegisai/aegisai.env
  install -d -o root -g root -m 0755 /opt/aegisai/dashboard

  echo "Building the Go control plane..."
  (
    cd "$ROOT/services/control-plane"
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /usr/local/bin/aegisai-control-plane ./cmd/server
  )
  chmod 0755 /usr/local/bin/aegisai-control-plane

  echo "Building the production dashboard..."
  (
    cd "$ROOT/apps/dashboard"
    npm install --no-audit --no-fund
    npm run build
  )
  [[ -f "$ROOT/apps/dashboard/.next/standalone/server.js" ]] || {
    echo "Next.js standalone output is missing; check the dashboard build logs." >&2
    exit 1
  }
  rm -rf /opt/aegisai/dashboard/*
  cp -a "$ROOT/apps/dashboard/.next/standalone/." /opt/aegisai/dashboard/
  install -d -o aegisai -g aegisai -m 0750 /opt/aegisai/dashboard/.next/cache
  cp -a "$ROOT/apps/dashboard/.next/static" /opt/aegisai/dashboard/.next/static
  if [[ -d "$ROOT/apps/dashboard/public" ]]; then
    cp -a "$ROOT/apps/dashboard/public" /opt/aegisai/dashboard/public
  else
    install -d /opt/aegisai/dashboard/public
  fi
  chown -R root:aegisai /opt/aegisai/dashboard
  chmod -R u+rwX,g+rX,o-rwx /opt/aegisai/dashboard
  chown -R aegisai:aegisai /opt/aegisai/dashboard/.next/cache
  chmod 0750 /opt/aegisai/dashboard/.next/cache

  install -o root -g root -m 0644 "$ROOT/deployments/systemd/aegisai-control-plane.service" /etc/systemd/system/aegisai-control-plane.service
  install -o root -g root -m 0644 "$ROOT/deployments/systemd/aegisai-dashboard.service" /etc/systemd/system/aegisai-dashboard.service
  systemctl daemon-reload
  systemctl enable --now aegisai-control-plane.service
  systemctl enable --now aegisai-dashboard.service
  printf '\nAegisAI systemd services are installed.\n'
  echo "Dashboard: http://127.0.0.1:3000"
  echo "Status: systemctl status aegisai-control-plane aegisai-dashboard"
  echo "Logs:   journalctl -u aegisai-control-plane -u aegisai-dashboard -f"
}

if [[ "$MODE" == "docker" ]]; then
  setup_docker
else
  setup_systemd
fi
