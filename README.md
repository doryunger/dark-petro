# STS viewer

Public map viewer for the ship-to-ship findings published by `maritime-sts-monitor` (its PLAN stage 8). Findings are
read from the Parquets that project's worker writes to S3; the viewer never writes to them. The monitor app and its
database are separate and stay behind their own login.

Stages: 1) data pipeline (below), 2) tile service (Python, DuckDB 2.0): serves filtered MVT tiles cut from the Parquet,
3) React app: collapsible reel of pairs on the left, map next to it; the reel lists what the map is showing. Design notes for 2
and 3 are in [pipeline/context/pipeline.md](pipeline/context/pipeline.md).

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

## Deploying

```
cp deploy/deploy.env.example deploy/deploy.env
./deploy/deploy.sh
cd pipeline && python3 -m unittest discover -s tests -t .
```

`deploy/deploy.env` (git-ignored) holds the server, SSH key and queue URL. `deploy.sh` copies the pipeline over, builds the
image, runs the tests inside it, installs the systemd units and runs the pipeline once. The server's `.env` holds only the
AWS read keys, region, `STS_BUCKET` and `STS_QUEUE_URL`.

Working rules for contributors and agents: [AGENTS.md](AGENTS.md). Design notes and the reasons behind non-obvious choices: [pipeline/context/pipeline.md](pipeline/context/pipeline.md).
