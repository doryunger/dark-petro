#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
. "${DEPLOY_ENV:-$ROOT/deploy/deploy.env}"
set +a
SSH=(ssh -i "$KEY" "$HOST")

RUN=(env)
docker info >/dev/null 2>&1 || RUN=(sudo env)

cd "$ROOT"
"${RUN[@]}" MAPBOX_ACCESS_TOKEN="$MAPBOX_ACCESS_TOKEN" MAPBOX_STYLE="${MAPBOX_STYLE:-}" VIEWER_PORT="$VIEWER_PORT" docker compose build viewer
"${RUN[@]}" docker run --rm --entrypoint python sts-tiles -m unittest discover -s tests -t .

"${SSH[@]}" mkdir -p sts-viewer/deploy
"${RUN[@]}" docker save sts-tiles | gzip | "${SSH[@]}" 'gunzip | sudo docker load'
rsync -az -e "ssh -i $KEY" "$ROOT"/deploy/sts-tiles.service "$ROOT/deploy/sts-tiles.timer" "$HOST:sts-viewer/deploy/"
rsync -az -e "ssh -i $KEY" "$ROOT/compose.yaml" "$HOST:sts-viewer/compose.yaml"

"${SSH[@]}" "QUEUE_URL='$STS_QUEUE_URL' CREDENTIALS_SOURCE='$CREDENTIALS_SOURCE' VIEWER_PORT='$VIEWER_PORT' bash -s" <<'REMOTE'
set -euo pipefail
cd ~/sts-viewer
APP_DIR="$PWD"
mkdir -p data
if [ ! -f .env ]; then
  umask 077
  grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)=' "$CREDENTIALS_SOURCE" > .env
  sed -n 's/^S3_BUCKET_NAME=/STS_BUCKET=/p' "$CREDENTIALS_SOURCE" >> .env
fi
grep -q '^STS_QUEUE_URL=' .env || echo "STS_QUEUE_URL=$QUEUE_URL" >> .env
for unit in sts-tiles.service sts-tiles.timer; do
  sed "s#@APP_DIR@#$APP_DIR#g" "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" > /dev/null
done
for unit in sts-tiles-listener.service sts-viewer.service; do
  sudo systemctl disable --now "$unit" 2>/dev/null || true
  sudo systemctl stop "$unit" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload
sudo docker rm -f sts-tiles-listener sts-viewer sts-tiles-watch >/dev/null 2>&1 || true
sudo systemctl enable --now sts-tiles.timer
sudo env VIEWER_PORT="$VIEWER_PORT" docker compose --profile ingest up -d --no-build --remove-orphans viewer watch listener
sudo systemctl start sts-tiles.service
sleep 5
curl -fsS "http://127.0.0.1:$VIEWER_PORT/metadata"
echo
cat data/status.json
REMOTE
