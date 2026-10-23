# Tile pipeline

## sync.py
- The monitor's worker rewrites `sts/<date>/<hot_spot>/<source>.parquet` in place (merge, `If-Match` on the ETag). A changed ETag is therefore the only "delta" signal; there are no new files per publish.
- The ETag stored in `state.json` is the one returned by `get_object`, not the one from the listing: the file can be rewritten between list and get, and the stored value must describe the bytes on disk.
- Captures are write-once (the file name carries the finding id and AIS names), so they are fetched only when missing and pruned when no finding references them.

## build.py
- Build id is `<utc stamp>-<first 12 of input hash>`. The hash covers every (S3 key, ETag) pair plus `SCHEMA_VERSION`; identical inputs never build twice.
- tippecanoe runs `-Z0 -z14 -r1 --no-feature-limit --no-tile-size-limit`: z14 resolves hulls about 50 m apart (about 2 m precision) and the map overzooms past it; nothing may be thinned or dropped at low zoom because every pair is a lead.
- `current` is a relative symlink replaced with `os.replace`, so a reader sees the old build or the new one, never a mix. The proxy mounts the data dir read-only; the relative target resolves inside the mount.
- Capture paths in `findings.json` are S3 keys (`captures/...`), mirrored as-is under `mirror/` and served under `/captures/`.
- DuckDB reads the Parquets with `union_by_name`: files differ in schema (columns that are all null in one file are typed differently in another). Pinned to 1.5.6; DuckDB 2.0 (2026-10-21) is to be benchmarked with the query layer.
- An empty row set never replaces a live build (`skipped_empty`): an empty listing is far more likely an S3 or credentials problem than real.

## features.py
- Tile layers: `pairs` at every zoom, `vessels` (hull 1 and 2) and `links` from z10. Tile attributes are small scalars for filtering; everything else is looked up in `findings.json` by `id`.
- `day` (whole UTC days since 1970) is on every layer so a date-range filter is an integer comparison, also on layers that carry no date string. Date and location are the primary filters, sensor (`source`) and `sanctioned` the secondary ones.
- `INTERNAL_COLUMNS` (job, attempt, review folder, code and rules versions, run, scene, hull ids) are dropped from every published file because the viewer is public and they name internal storage. They stay in the S3 Parquets.
- `SCHEMA_VERSION` is part of the build hash. Bump it whenever layers or attributes change, otherwise unchanged S3 inputs would skip the rebuild.
- `finding_id` is unique across the product; if a merge ever leaves two rows, the row from the most recently written file wins.

## listen.py
- Waits on the SQS queue that S3 notifies. One build per burst: the worker writes several Parquets per job, so collection continues until the queue has been quiet for `SETTLE_S` (10 s), never longer than `SETTLE_MAX_S` (60 s). `WAIT_S` is the SQS long-poll maximum (20 s).
- Messages are deleted only after the run succeeded; a failed run leaves them for redelivery, and the queue's redrive policy moves them to the dead-letter queue after 5 receives. Test events and keys outside `sts/*.parquet` are deleted immediately.
- SIGTERM is handled explicitly: the process is PID 1 in its container and would otherwise ignore it.
- A peek at the queue with `VisibilityTimeout=0` still counts as a receive; five of them send a message to the dead-letter queue.

## __main__.py
- `run` syncs from S3 and builds if anything changed, `build` rebuilds from the local mirror only, `listen` runs on S3 events.
- A file lock in the data dir keeps the listener and the hourly timer off the data at the same time. The timer only reconciles in case an event was missed.
