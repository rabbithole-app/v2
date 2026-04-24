#!/bin/bash
set -e

cd "$(dirname "$0")/.."

export COMPOSE_PROJECT_NAME=rabbithole

CADDY_CONTAINER="$(docker ps -q --filter "name=caddy")"
if [ -z "$CADDY_CONTAINER" ]; then
  echo "Caddy container is not running. Start the compose stack first (npx nx compose backend -- up -d)." >&2
  exit 1
fi
docker cp "$CADDY_CONTAINER:/data/caddy/pki/authorities/local/root.crt" ./root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain root.crt

echo "CA certificate installed successfully"
