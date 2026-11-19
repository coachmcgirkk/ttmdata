#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper for the two services.
# Examples:
#   ./scripts/servicectl.sh status
#   ./scripts/servicectl.sh restart
#   ./scripts/servicectl.sh logs

ACTION="${1:-status}"

case "${ACTION}" in
  start|stop|restart|status)
    sudo systemctl "${ACTION}" aadt-backend.service aadt-frontend.service
    ;;
  logs)
    sudo journalctl -u aadt-backend.service -u aadt-frontend.service -f
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
