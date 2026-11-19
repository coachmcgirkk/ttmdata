#!/usr/bin/env bash
set -euo pipefail

# Removes the installed systemd service units.
# Run with sudo:
#   sudo ./scripts/uninstall-systemd-services.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (use sudo)." >&2
  exit 1
fi

systemctl disable --now aadt-backend.service aadt-frontend.service 2>/dev/null || true
rm -f /etc/systemd/system/aadt-backend.service
rm -f /etc/systemd/system/aadt-frontend.service
systemctl daemon-reload

echo "Removed aadt-backend.service and aadt-frontend.service"
