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
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "deploy from main" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree is not clean" >&2; exit 1; }
SHA="$(git rev-parse HEAD)"
[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$SHA" ] || { echo "HEAD is not the tip of origin/main: push it first (with the user's say-so)" >&2; exit 1; }
REPO_URL="${REPO_URL:-$(git remote get-url origin | sed -E 's#^git@([^:]+):#https://\1/#')}"

"${RUN[@]}" MAPBOX_ACCESS_TOKEN="$MAPBOX_ACCESS_TOKEN" MAPBOX_STYLE="${MAPBOX_STYLE:-}" VIEWER_PORT="$VIEWER_PORT" docker compose build viewer
"${RUN[@]}" docker run --rm --entrypoint python sts-tiles -m unittest discover -s tests -t .

"${SSH[@]}" "REPO_URL='$REPO_URL' SHA='$SHA' bash -s" <<'PULL'
set -euo pipefail
mkdir -p ~/dark-petro
cd ~/dark-petro
if [ ! -d .git ]; then
  git init -q -b main
  git remote add origin "$REPO_URL"
  git fetch -q origin main
  git checkout -q -f -B main origin/main
fi
git fetch -q origin main
git merge -q --ff-only "$SHA"
test "$(git rev-parse HEAD)" = "$SHA"
PULL
"${RUN[@]}" docker save sts-tiles | gzip | "${SSH[@]}" 'gunzip | sudo docker load'

"${SSH[@]}" "QUEUE_URL='$STS_QUEUE_URL' CREDENTIALS_SOURCE='$CREDENTIALS_SOURCE' VIEWER_PORT='$VIEWER_PORT' bash -s" <<'REMOTE'
set -euo pipefail
cd ~/dark-petro
APP_DIR="$PWD"
mkdir -p data
if [ ! -f .env ]; then
  umask 077
  grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)=' "$CREDENTIALS_SOURCE" > .env
  sed -n 's/^S3_BUCKET_NAME=/STS_BUCKET=/p' "$CREDENTIALS_SOURCE" >> .env
fi
grep -q '^STS_QUEUE_URL=' .env || echo "STS_QUEUE_URL=$QUEUE_URL" >> .env
grep -q '^VIEWER_PORT=' .env || echo "VIEWER_PORT=$VIEWER_PORT" >> .env
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
