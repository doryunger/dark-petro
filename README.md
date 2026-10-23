# STS viewer

Public map viewer for the ship-to-ship findings published by `maritime-sts-monitor` (its PLAN stage 8). Findings are
read from the Parquets that project's worker writes to S3; the viewer never writes to them. The monitor app and its
database are separate and stay behind their own login.

Stages: 1) tile pipeline (done, below), 2) tile serving and filtering (PMTiles through the server's proxy), 3) React app:
collapsible reel of pairs on the left, map next to it.

## Tile pipeline (`pipeline/`)

Runs on every S3 publish (an SQS event reaches `sts-tiles-listener`) and hourly as a safety net (`deploy/sts-tiles.timer`):

1. List `sts/**.parquet` in the bucket. Download every key whose ETag changed since the last run into `data/mirror/`, drop
   keys gone from S3 (`data/state.json` holds key to ETag). The worker rewrites these files in place, so a changed ETag is
   the only delta signal.
2. If the hash of all (key, ETag) pairs and the schema version equals the live build's `input_hash`, stop.
3. Otherwise read all rows (DuckDB), dedupe on `finding_id`, mirror the PNGs they reference, and build `sts.pmtiles` with
   tippecanoe (z0-14, nothing dropped) in a new `data/builds/<stamp>-<hash>/`.
4. Swap `data/current` to the new build in one rename; keep the last 5 builds.

Output under the server's `sts-viewer/data/`:

| Path | What |
|---|---|
| `current/sts.pmtiles` | MVT tiles. Layers: `pairs` (pair centre, z0+), `vessels` (hull 1 and 2, z10+), `links` (line between them, z10+) |
| `current/findings.json` | Every finding for the reel panel, joined to tiles by `id` = `finding_id` |
| `current/findings.parquet` | The same rows as one table |
| `current/manifest.json` | Build id, inputs and ETags, counts per hot spot / source / QA status, time range, bounds |
| `mirror/captures/...` | The capture PNGs, at their S3 keys |
| `status.json` | Result of the last run (`built`, `up_to_date`, `skipped_empty`, `failed`) |

Files published to the web carry no internal provenance (job, attempt, review folder, code and rules versions).

Tile attributes for filters, primary first: `day` (UTC days since 1970, on every layer), `t` (epoch s), `date`, `hot_spot`;
then `source` (sensor) and `sanctioned`; also `verdict`, `qa_status`, `named` (0-2 AIS names), `ais_covered`, `length_m`,
`v1_name`, `v2_name`, `v1_flag`, `v2_flag`. Location is the geometry.

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
