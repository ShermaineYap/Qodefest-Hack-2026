#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${REPORT_ENV_FILE:-$HOME/.config/lantern/report.env}"
if [[ -f "$env_file" ]]; then
  set -a
  . "$env_file"
  set +a
fi

report_dir="${REPORT_DIR:-/srv/reports}"
mkdir -p "$report_dir"
exec 9>"$report_dir/.report.lock"
flock -n 9 || { echo "report: another run is in progress"; exit 0; }

cd "$here"
exec node --disable-warning=ExperimentalWarning report.mjs "$@"
