#!/usr/bin/env bash
# From your computer: sends the committed code (HEAD, or the git ref you name) to the server and updates every madrasah.
#   deploy/ship.sh [git ref]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SERVER=${MADRASAH_SERVER:-ubuntu@213.32.71.244}
KEY=${MADRASAH_KEY:-$HOME/.ssh/madrasah_vps}
REF=${1:-HEAD}
SHA=$(git rev-parse --short "$REF")
echo "Sending $SHA to $SERVER"
started=$(date +%s)
# The last line says plainly whether it worked, and the script's exit code matches, so whoever started it knows it's done.
if git -c core.autocrlf=false archive --format=tar.gz "$REF" | ssh -i "$KEY" "$SERVER" 'set -e
  cd /srv/madrasah && rm -rf src.new && mkdir src.new && tar xzf - -C src.new
  cp src.new/deploy/compose.yml src.new/deploy/Caddyfile src.new/deploy/madrasah src.new/deploy/owner-health src.new/deploy/owner-actions . && chmod +x madrasah owner-health owner-actions
  rm -rf src && mv src.new src
  docker compose up -d --remove-orphans
  # Detached, so a dropped connection cannot stop it half-way; its output is followed here and kept in update.log.
  nohup ./madrasah update > update.log 2>&1 </dev/null &
  update=$!
  tail -n +1 --pid=$update -f update.log &
  # This shell waits for the update itself: tail alone never noticed it had finished (it became the update'"'"'s parent and
  # left it a zombie), so ships hung after succeeding.
  status=0; wait $update || status=$?
  wait
  exit $status'; then
  echo "SHIPPED $SHA: every madrasah updated and restarted ($(( ($(date +%s) - started) / 60 )) min)."
else
  echo "SHIP FAILED for $SHA after $(( ($(date +%s) - started) / 60 )) min: see the output above, or /srv/madrasah/update.log on the server." >&2
  exit 1
fi
