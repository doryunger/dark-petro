# STS viewer

Public map viewer for the ship-to-ship findings published by `maritime-sts-monitor` (its PLAN stage 8). Findings are
read from the Parquets that project's worker writes to S3; the viewer never writes to them. The monitor app and its
database are separate and stay behind their own login.

Stages: 1) data pipeline (below), 2) tile service (Python, DuckDB 2.0) that serves filtered MVT tiles cut from the Parquet, the
metadata, the captures and the app, 3) the React app: a reel of pairs and a details panel on the left, the map next to them; the
list shows what the map is showing. Design notes: [pipeline/context/pipeline.md](pipeline/context/pipeline.md) for the
pipeline and the service, [frontend/context/frontend.md](frontend/context/frontend.md) for the app.

## Data pipeline (`pipeline/`)

Runs on every S3 publish (an SQS event reaches `sts-tiles-listener`) and hourly as a safety net (`deploy/sts-tiles.timer`):

1. List `sts/**.parquet` in the bucket. Download every key whose ETag changed since the last run into `data/mirror/`, drop
   keys gone from S3 (`data/state.json` holds key to ETag). The worker rewrites these files in place, so a changed ETag is
   the only delta signal.
2. If the hash of all (key, ETag) pairs and the schema version equals the live build's `input_hash`, stop.
3. Otherwise read all rows (DuckDB), dedupe on `finding_id`, mirror the PNGs they reference, and write one public-safe
   `findings.parquet` in a new `data/builds/<stamp>-<hash>/`.
4. Swap `data/current` to the new build in one rename; keep the last 5 builds.

Output under the server's `sts-viewer/data/`:

| Path | What |
|---|---|
| `current/findings.parquet` | One row per finding, internal columns removed |
| `current/manifest.json` | Build id, inputs and ETags, counts per hot spot / source / QA status, time range, bounds |
| `mirror/captures/...` | The capture PNGs, at their S3 keys |
| `status.json` | Result of the last run (`built`, `up_to_date`, `skipped_empty`, `failed`) |

Files published to the web carry no internal provenance (job, attempt, review folder, code and rules versions).

## Viewer (`frontend/`, `pipeline/sts_tiles/serve.py`)

```
cd frontend && npm ci && npm test
cd ../pipeline && python3 -m unittest discover -s tests -t .
```

For local work, run the service on a data directory with a `current/` build (`STS_DATA_DIR=... STS_PORT=8090 python -m sts_tiles serve`)
and `npm run dev` in `frontend/`. The Mapbox token goes in `frontend/.env.local` (see `frontend/.env.example`). The service
needs DuckDB's spatial extension (`INSTALL spatial` once, or `STS_DUCKDB_EXTENSIONS` pointing at an installed copy).

## Deploying

```
cp deploy/deploy.env.example deploy/deploy.env
./deploy/deploy.sh
cd pipeline && python3 -m unittest discover -s tests -t .
```

`deploy/deploy.env` (git-ignored) holds the server, SSH key, queue URL, the viewer's loopback port and the public Mapbox token. `deploy.sh` builds the app here, copies the pipeline and the app over, builds the
image, runs the tests inside it, installs the systemd units (the listener, the timer and the viewer) and runs the pipeline once. The proxy
on the server has to forward the viewer's address to the viewer's loopback port; that config lives on the server, outside this repo. The server's `.env` holds only the
AWS read keys, region, `STS_BUCKET` and `STS_QUEUE_URL`.

Working rules for contributors and agents: [AGENTS.md](AGENTS.md). Design notes and the reasons behind non-obvious choices: [pipeline/context/pipeline.md](pipeline/context/pipeline.md) and [frontend/context/frontend.md](frontend/context/frontend.md).
