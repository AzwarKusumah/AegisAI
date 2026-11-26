#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
MODE=""

usage() {
  cat <<'EOF'
AegisAI deployment installer (the recommended interactive setup is deployments/setup)

Usage:
  ./deployments/install.sh --mode docker
  sudo ./deployments/install.sh --mode systemd
  sudo ./deployments/install.sh --mode systemd --env-file /path/to/.env

The setup TUI collects credentials and writes the environment file before calling this installer.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$MODE" != "docker" && "$MODE" != "systemd" ]]; then
  echo "Specify --mode docker or --mode systemd. Use the AegisAI setup TUI for configuration." >&2
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

validate_env() {
  [[ -f "$ENV_FILE" ]] || { echo "Configuration file not found: $ENV_FILE" >&2; exit 1; }
  local key value
  for key in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL AEGIS_AGENT_TOKEN AEGIS_ADMIN_TOKEN AEGIS_DASHBOARD_USER AEGIS_DASHBOARD_PASSWORD AEGIS_DASHBOARD_PORT AEGIS_DASHBOARD_BIND PORT HOSTNAME; do
    value="$(read_env "$key")"
    if [[ -z "$value" ]]; then
      echo "Missing value for $key in $ENV_FILE. Run the setup TUI first." >&2
      exit 1
    fi
  done
}

setup_docker() {
  require_cmd docker
  docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is required (docker compose)." >&2; exit 1; }
  validate_env
  docker compose --env-file "$ENV_FILE" -f "$ROOT/deployments/compose/docker-compose.yml" config --quiet
  docker compose --env-file "$ENV_FILE" -f "$ROOT/deployments/compose/docker-compose.yml" up -d --build
  printf '\nAegisAI is starting. Dashboard: http://%s:%s\n' "$(read_env AEGIS_DASHBOARD_BIND)" "$(read_env AEGIS_DASHBOARD_PORT)"
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
  require_cmd psql
  validate_env

  local go_version node_version db_password db_host db_port db_user db_name db_sslmode
  go_version="$(go version | awk '{print $3}' | sed 's/^go//')"
  node_version="$(node --version | sed 's/^v//')"
  version_at_least "$go_version" "1.23" || { echo "Go >= 1.23 is required (found $go_version)." >&2; exit 1; }
  version_at_least "$node_version" "20.0.0" || { echo "Node.js >= 20 is required (found $node_version)." >&2; exit 1; }

  db_password="$(read_env POSTGRES_PASSWORD)"
  db_host="$(read_env POSTGRES_HOST)"
  db_port="$(read_env POSTGRES_PORT)"
  db_user="$(read_env POSTGRES_USER)"
  db_name="$(read_env POSTGRES_DB)"
  db_sslmode="$(read_env POSTGRES_SSLMODE)"
  [[ -n "$db_host" && -n "$db_port" && -n "$db_sslmode" ]] || {
    echo "POSTGRES_HOST, POSTGRES_PORT, and POSTGRES_SSLMODE are required for systemd." >&2
    exit 1
  }

  echo "Checking PostgreSQL credentials and schema privileges..."
  probe_table="aegisai_setup_check_$"
  if ! PGPASSWORD="$db_password" PGSSLMODE="$db_sslmode" psql \
      --host="$db_host" --port="$db_port" --username="$db_user" --dbname="$db_name" \
      --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
      --command="BEGIN; CREATE TABLE public.${probe_table} (id INTEGER); DROP TABLE public.${probe_table}; ROLLBACK;" >/dev/null 2>&1; then
    echo "Could not authenticate or create tables in public schema at $db_host:$db_port/$db_name." >&2
    echo "Check database/user credentials, SSL mode, firewall, and CREATE privilege on schema public." >&2
    exit 1
  fi

  if ! getent group aegisai >/dev/null 2>&1; then
    groupadd --system aegisai
  fi
  if ! id aegisai >/dev/null 2>&1; then
    useradd --system --gid aegisai --home-dir /var/lib/aegisai --create-home --shell /usr/sbin/nologin aegisai
  else
    usermod --append --groups aegisai aegisai
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
  find /opt/aegisai/dashboard -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
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
  echo "Dashboard: http://$(read_env AEGIS_DASHBOARD_BIND):$(read_env AEGIS_DASHBOARD_PORT)"
  echo "Status: systemctl status aegisai-control-plane aegisai-dashboard"
  echo "Logs:   journalctl -u aegisai-control-plane -u aegisai-dashboard -f"
}

if [[ "$MODE" == "docker" ]]; then
  setup_docker
else
  setup_systemd
fi
