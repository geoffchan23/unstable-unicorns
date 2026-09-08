#!/usr/bin/env bash
set -euo pipefail
HOST=${UU_HOST:-ubuntu@140.238.145.208}
KEY=${UU_KEY:-$HOME/.ssh/oci_wordle_key}
cd "$(dirname "$0")/.."
npm run build:server
ssh -i "$KEY" "$HOST" 'mkdir -p ~/unicorns'
scp -i "$KEY" dist/server/unicorns-server.mjs deploy/ecosystem.config.cjs "$HOST":~/unicorns/
ssh -i "$KEY" "$HOST" 'set -e; cd ~/unicorns; test -f .env || { echo "create ~/unicorns/.env first (see docs/DEPLOY.md)"; exit 1; }; set -a; . ./.env; set +a; pm2 startOrRestart ecosystem.config.cjs --update-env; pm2 save; sleep 1; curl -fsS localhost:8787/healthz && echo " healthy"'
