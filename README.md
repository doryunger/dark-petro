# STS viewer

Public map viewer for the ship-to-ship findings published by `maritime-sts-monitor` (its PLAN stage 8). Findings are
read from the Parquets that project's worker writes to S3; the viewer never writes to them. The monitor app and its
database are separate and stay behind their own login.

Stages: 1) data pipeline (below), 2) tile service (Python, DuckDB 2.0) that serves filtered MVT tiles cut from the Parquet, the
metadata, the captures and the app, 3) the React app: a reel with two tabs (suspicious activity and sanctioned vessels) and a details panel on the left, the map next to them; the
list shows what the map is showing. Design notes: [pipeline/context/pipeline.md](pipeline/context/pipeline.md) for the
pipeline and the service, [frontend/context/frontend.md](frontend/context/frontend.md) for the app.

## Data pipeline (`pipeline/`)

Runs on every S3 publish (an SQS event reaches `sts-tiles-listener`) and hourly as a safety net (`deploy/sts-tiles.timer`):

1. List `sts/**.parquet` (pairs) and `sanctioned/**.parquet` (single sanctioned vessels) in the bucket. Download every key whose ETag changed since the last run into `data/mirror/`, drop
   keys gone from S3 (`data/state.json` holds key to ETag). The worker rewrites these files in place, so a changed ETag is
   the only delta signal.
2. If the hash of all mirrored files' contents and the schema version equals the live build's `input_hash`, stop.
3. Otherwise read all rows (DuckDB), dedupe on `finding_id`, mirror the PNGs they reference, and write one public-safe
   `findings.parquet` in a new `data/builds/<stamp>-<hash>/`.
4. Swap `data/current` to the new build in one rename; keep the last 5 builds.

Output under the server's `sts-viewer/data/`:

| Path | What |
|---|---|
| `current/findings.parquet` | One row per pair finding, internal columns removed |
| `current/sanctioned.parquet` | One row per sanctioned-vessel finding, internal columns removed (empty when there are none) |
| `current/manifest.json` | Build id, inputs and their SHA-256, counts per hot spot / source / QA status, time range, bounds |
| `mirror/captures/...` | The capture PNGs, at their S3 keys |
| `status.json` | Result of the last run (`built`, `up_to_date`, `skipped_empty`, `failed`) |

Files published to the web carry no internal provenance (job, attempt, review folder, code and rules versions).

## Viewer (`frontend/`, `pipeline/sts_tiles/serve.py`)

```
cd frontend && npm ci && npm run typecheck && npm test
cd ../pipeline && python3 -m unittest discover -s tests -t .
```

One image (`Dockerfile` at the root) holds the pipeline, the tile service and the built app, so it behaves the same on a laptop and on the server. The build runs the frontend tests and the app build in its first stage and the Python tests are run against the image by `deploy.sh`.

```
docker compose build
STS_DATA_DIR=/path/to/data docker compose up viewer
```

The data directory needs a `current/` build. Put `MAPBOX_ACCESS_TOKEN` (a public `pk.` token) and `VIEWER_PORT` in the environment or a git-ignored `.env`; the viewer is at `http://127.0.0.1:$VIEWER_PORT`. For work on the app itself, run the service and `npm run dev` in `frontend/` (token in `frontend/.env.local`, see `frontend/.env.example`).

## Deploying

```
cp deploy/deploy.env.example deploy/deploy.env
./deploy/deploy.sh
cd pipeline && python3 -m unittest discover -s tests -t .
```

`deploy/deploy.env` (git-ignored) holds the server, SSH key, queue URL, the viewer's loopback port and the public Mapbox token. `deploy.sh` copies the sources over, builds the image there (the app is built inside it), runs the Python tests in it, starts the viewer and the listener with `docker compose`, installs the hourly systemd timer and runs the pipeline once. The proxy
on the server has to forward the viewer's address to the viewer's loopback port; that config lives on the server, outside this repo. The server's `.env` holds only the
AWS read keys, region, `STS_BUCKET` and `STS_QUEUE_URL`.

## Checks

Run `./setup-hooks.sh` once in a checkout to install the pre-commit check. It runs `cd frontend && npm run check`, which runs Biome lint, TypeScript typechecking and the frontend tests. The same command runs in the image build and in the GitHub Actions workflow.

Working rules for contributors and agents: [AGENTS.md](AGENTS.md). Design notes and the reasons behind non-obvious choices: [pipeline/context/pipeline.md](pipeline/context/pipeline.md) and [frontend/context/frontend.md](frontend/context/frontend.md).
