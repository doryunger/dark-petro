#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

DOCKER=(docker)
docker info >/dev/null 2>&1 || DOCKER=(sudo docker)

port=$(sed -n 's/^VIEWER_PORT=//p' .env)
port=${port:-8090}

"${DOCKER[@]}" compose up --timeout 3 -d --build --force-recreate viewer watch

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$port/metadata" 2>/dev/null; then
    echo
    "${DOCKER[@]}" compose ps --format '{{.Name}} {{.Status}}'
    echo "http://127.0.0.1:$port"
    exit 0
  fi
  sleep 1
done

echo "the viewer did not answer on port $port" >&2
"${DOCKER[@]}" compose logs --tail 20 viewer >&2
exit 1
