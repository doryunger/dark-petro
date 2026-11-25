# Development and deployment

## Running the viewer (`frontend/`, `pipeline/sts_tiles/serve.py`)

```
cd frontend && npm ci && npm run typecheck && npm test
cd ../pipeline && python3 -m unittest discover -s tests -t .
```

One image (`Dockerfile` at the root) holds the pipeline, the tile service and the built web viewer, so it behaves the same on a
laptop and on the server. The build runs the frontend tests and the web viewer build in its first stage and the Python tests are
run against the image by `deploy.sh`.

```
docker compose build
STS_DATA_DIR=/path/to/data docker compose up viewer
```

The data directory needs a `current/` build. Put `MAPBOX_ACCESS_TOKEN` (a public `pk.` token) and `VIEWER_PORT` in the
environment or a git-ignored `.env`; the viewer is at `http://127.0.0.1:$VIEWER_PORT`. For work on the web viewer itself, run the
service and `npm run dev` in `frontend/` (token in `frontend/.env.local`, see `frontend/.env.example`).

## Deploying

```
cp deploy/deploy.env.example deploy/deploy.env
./deploy/deploy.sh
cd pipeline && python3 -m unittest discover -s tests -t .
```

`deploy/deploy.env` (git-ignored) holds the server, SSH key, queue URL, the viewer's loopback port and the public Mapbox
token. `deploy.sh` refuses to run unless the tree is clean on `main` and HEAD is the tip of `origin/main`. It builds the
image locally (the web viewer is built inside it) and runs the Python tests in it. On the server, `~/dark-petro` is a git checkout:
the script fast-forwards it to that exact commit (no files are copied around Git), so `compose.yaml` and the systemd units
come from the repo. The image is forwarded with `docker save`, the viewer, watcher and listener are restarted, the hourly
systemd timer is installed and the pipeline runs once. The web proxy forwards the viewer's address to the viewer's loopback
port. The server's `.env` holds the AWS read keys, region, `STS_BUCKET`, `STS_QUEUE_URL` and `VIEWER_PORT`.

Starting or restarting the services on the server never builds: `docker compose --profile ingest up -d --no-build viewer
watch listener` (or `./restart.sh`, which does exactly that and waits for `/metadata`) uses the `sts-tiles` image that
`deploy.sh` loaded. The listener is started by Compose only; there is no systemd unit for it. The hourly pipeline run is
`deploy/sts-tiles.service` and `deploy/sts-tiles.timer`, which `deploy.sh` installs.

## Checks

Run `./setup-hooks.sh` once in a checkout to install the pre-commit check. It runs `cd frontend && npm run check`, which
runs Biome lint, TypeScript typechecking and the frontend tests. The same command runs in the image build and in the GitHub
Actions workflow.

Working rules for contributors and agents: [AGENTS.md](AGENTS.md). Design notes and the reasons behind non-obvious choices:
[pipeline/context/pipeline.md](pipeline/context/pipeline.md) and [frontend/context/frontend.md](frontend/context/frontend.md).
