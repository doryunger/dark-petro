#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
. "${DEPLOY_ENV:-$ROOT/deploy/deploy.env}"
set +a
SSH=(ssh -i "$KEY" "$HOST")

"${SSH[@]}" mkdir -p sts-viewer/src sts-viewer/deploy
rsync -az --delete -e "ssh -i $KEY" --exclude __pycache__ --exclude node_modules --exclude dist --exclude '.env*' \
  "$ROOT/Dockerfile" "$ROOT/.dockerignore" "$ROOT/pipeline" "$ROOT/frontend" "$HOST:sts-viewer/src/"
rsync -az -e "ssh -i $KEY" "$ROOT"/deploy/sts-tiles.service "$ROOT/deploy/sts-tiles.timer" "$ROOT/compose.yaml" "$HOST:sts-viewer/deploy/"

"${SSH[@]}" "QUEUE_URL='$STS_QUEUE_URL' CREDENTIALS_SOURCE='$CREDENTIALS_SOURCE' VIEWER_PORT='$VIEWER_PORT' MAPBOX_TOKEN='$MAPBOX_ACCESS_TOKEN' MAPBOX_STYLE='${MAPBOX_STYLE:-}' bash -s" <<'REMOTE'
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
cp deploy/compose.yaml compose.yaml
export STS_BUILD_CONTEXT=src MAPBOX_ACCESS_TOKEN="$MAPBOX_TOKEN" MAPBOX_STYLE VIEWER_PORT
sudo -E docker compose --profile ingest build viewer
sudo docker run --rm --entrypoint python sts-tiles -m unittest discover -s tests -t .
for unit in sts-tiles.service sts-tiles.timer; do
  sed "s#@APP_DIR@#$APP_DIR#g" "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" > /dev/null
done
sudo systemctl disable --now sts-tiles-listener.service sts-viewer.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/sts-tiles-listener.service /etc/systemd/system/sts-viewer.service
sudo systemctl daemon-reload
sudo systemctl enable --now sts-tiles.timer
sudo -E docker compose --profile ingest up -d --remove-orphans viewer watch listener
sudo systemctl start sts-tiles.service
sleep 5
curl -fsS "http://127.0.0.1:$VIEWER_PORT/metadata"
echo
cat data/status.json
REMOTE
