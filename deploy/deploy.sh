#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
. "${DEPLOY_ENV:-$ROOT/deploy/deploy.env}"
set +a
SSH=(ssh -i "$KEY" "$HOST")

(cd "$ROOT/frontend" && npm ci --silent && VITE_MAPBOX_TOKEN="$MAPBOX_ACCESS_TOKEN" npm run build --silent)

"${SSH[@]}" mkdir -p sts-viewer/pipeline sts-viewer/deploy sts-viewer/app
rsync -az --delete -e "ssh -i $KEY" --exclude __pycache__ "$ROOT/pipeline/" "$HOST:sts-viewer/pipeline/"
rsync -az -e "ssh -i $KEY" "$ROOT"/deploy/sts-tiles*.service "$ROOT/deploy/sts-tiles.timer" "$ROOT/deploy/sts-viewer.service" "$HOST:sts-viewer/deploy/"
rsync -az --delete -e "ssh -i $KEY" "$ROOT/frontend/dist/" "$HOST:sts-viewer/app/"

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
sudo docker build -q -t sts-tiles pipeline
sudo docker run --rm --entrypoint python sts-tiles -m unittest discover -s tests -t .
for unit in sts-tiles.service sts-tiles-listener.service sts-tiles.timer sts-viewer.service; do
  sed "s#@APP_DIR@#$APP_DIR#g; s#@PORT@#$VIEWER_PORT#g" "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" > /dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now sts-tiles.timer
sudo systemctl enable sts-tiles-listener.service
sudo systemctl restart sts-tiles-listener.service
sudo systemctl start sts-tiles.service
sudo systemctl enable sts-viewer.service
sudo systemctl restart sts-viewer.service
sleep 5
curl -fsS "http://127.0.0.1:$VIEWER_PORT/metadata"
echo
cat data/status.json
REMOTE
