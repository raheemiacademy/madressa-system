#!/usr/bin/env bash
# From your computer: sends the committed code (HEAD, or the git ref you name) to the server and updates every madrasah.
#   deploy/ship.sh [git ref]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SERVER=${MADRASAH_SERVER:-ubuntu@213.32.71.244}
KEY=${MADRASAH_KEY:-$HOME/.ssh/madrasah_vps}
REF=${1:-HEAD}
echo "Sending $(git rev-parse --short "$REF") to $SERVER"
git -c core.autocrlf=false archive --format=tar.gz "$REF" | ssh -i "$KEY" "$SERVER" 'set -e
  cd /srv/madrasah && rm -rf src.new && mkdir src.new && tar xzf - -C src.new
  cp src.new/deploy/compose.yml src.new/deploy/Caddyfile src.new/deploy/madrasah . && chmod +x madrasah
  rm -rf src && mv src.new src
  docker compose up -d
  ./madrasah update'
