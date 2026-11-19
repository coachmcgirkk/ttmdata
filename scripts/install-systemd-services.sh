#!/usr/bin/env bash
set -euo pipefail

# Installs systemd services for this repository's backend/frontend.
# Run with sudo:
#   sudo ./scripts/install-systemd-services.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-${USER}}"
SYSTEMD_DIR="/etc/systemd/system"

BACKEND_UNIT="${SYSTEMD_DIR}/aadt-backend.service"
FRONTEND_UNIT="${SYSTEMD_DIR}/aadt-frontend.service"

cat > "${BACKEND_UNIT}" <<EOF
[Unit]
Description=AADT Flask Backend
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${REPO_DIR}/backend
ExecStart=${REPO_DIR}/backend/.venv/bin/python app.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

cat > "${FRONTEND_UNIT}" <<EOF
[Unit]
Description=AADT React Frontend (CRA)
After=network.target aadt-backend.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${REPO_DIR}/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=development
Environment=BROWSER=none
Environment=PORT=3001
Environment=HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aadt-backend.service aadt-frontend.service
systemctl restart aadt-backend.service aadt-frontend.service

echo "Installed and started:"
echo "  - aadt-backend.service"
echo "  - aadt-frontend.service"
echo
echo "Check status:"
echo "  systemctl status aadt-backend.service aadt-frontend.service"
echo "View logs:"
echo "  journalctl -u aadt-backend.service -u aadt-frontend.service -f"
