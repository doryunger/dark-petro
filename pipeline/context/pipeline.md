# Tile pipeline

## sync.py
- The monitor's worker rewrites `sts/<date>/<hot_spot>/<source>.parquet` in place (merge, `If-Match` on the ETag). A changed ETag is therefore the only "delta" signal; there are no new files per publish.
- The ETag stored in `state.json` is the one returned by `get_object`, not the one from the listing: the file can be rewritten between list and get, and the stored value must describe the bytes on disk.
- Captures are write-once (the file name carries the finding id and AIS names), so they are fetched only when missing and pruned when no finding references them.

## build.py
- Build id is `<utc stamp>-<first 12 of input hash>`. The hash covers every (S3 key, ETag) pair plus `SCHEMA_VERSION`; identical inputs never build twice.
- `current` is a relative symlink replaced with `os.replace`, so a reader sees the old build or the new one, never a mix. The proxy mounts the data dir read-only; the relative target resolves inside the mount.
- Capture paths (`capture_png`) are S3 keys (`captures/...`), mirrored as-is under `mirror/` and served under `/captures/`.
- DuckDB reads the Parquets with `union_by_name`: files differ in schema (columns that are all null in one file are typed differently in another). Pinned to 2.0.0 (the Python API dropped `fetch_arrow_table`; `to_arrow_table` replaces it). `ST_AsMVT`, `ST_AsMVTGeom` and `ST_TileEnvelope` exist in 2.0.0: a 1000-point tile with a date filter took 3-4 ms in memory on a laptop, 7-31 KB per tile.
- An empty row set never replaces a live build (`skipped_empty`): an empty listing is far more likely an S3 or credentials problem than real.

## features.py
- No tile layers any more: the PMTiles file and tippecanoe were dropped because DuckDB cuts MVT tiles from the Parquet on request, so there is nothing to keep in step with a prebuilt file. The trade is no static fallback if the service is down.
- `INTERNAL_COLUMNS` (job, attempt, review folder, code and rules versions, run, scene, hull ids) are dropped from `findings.parquet` because the viewer is public and they name internal storage. They stay in the S3 Parquets.
- `SCHEMA_VERSION` is part of the build hash. Bump it whenever the published Parquet changes, otherwise unchanged S3 inputs would skip the rebuild.
- `finding_id` is unique across the product; if a merge ever leaves two rows, the row from the most recently written file wins.

## Query service (design, not built yet)
- Python with DuckDB 2.0; DuckDB does the heavy work, so the language is only HTTP. Go was considered and left out: `go-duckdb` support for 2.0 is unverified and needs cgo.
- One endpoint, `/tiles/{z}/{x}/{y}.mvt`, with the filters (`date` range, `source`, `sanctioned`, later more) in the query string; no filters means every finding. The app has no JSON endpoint: the list is built from what the map shows (`queryRenderedFeatures` on the tile layer), so the list and the map are the same rows by construction. Filters are always bound as DuckDB parameters.
- Everything the list or a detail view shows has to be a tile attribute, since tiles are the only data the app receives. The app dedupes by `id` because a feature can come back from two tiles.
- A tile is one query per `z/x/y`. Running the filter once and cutting every tile from a saved result (keyed by the normalised filters plus the build id, with an idle timeout, a cap on how many are held on the 2 GB shared server, and expiry on a new build) is an optimisation to add only if the per-tile cost shows up in measurements.
- Tile attributes: `id`, `date` (UTC `YYYY-MM-DD`, compares as a string, so no separate day integer), `t` (epoch s), `hot_spot`, `source`, `sanctioned`, `image` (capture PNG key under `/captures/`), and the vessel names and flags of both hulls. `verdict`, `qa_status`, `named`, `ais_covered` and `length_m` are not tile attributes. Location is the geometry, which is all clusters and sectors need.
- The tiles always carry every finding at every zoom; nothing is clustered, thinned or dropped in the MVT. Clustering is only a grouping of the list in the app, with three levels. Each cluster is tied to an area that the app draws as a GeoJSON fill polygon, and clicking it flies the map to that area, which loads new tiles and rebuilds the list.
  - Below zoom 10 (the global view): the four hot-spot areas (`fujairah_outer`, `off_sohar`, `malaysia_eopl`, `johor_east_scs`), drawn with their boundaries. This is the one case where clusters are shown by default.
  - Zoom 10-13: a hot spot is broken into four quadrants (NE, SE, SW, NW), cut from the centre of the hot spot, shown only when the pairs on the display exceed 20.
  - Zoom 14 and up: the list decides how many clusters there are from the pairs on the display, shown only when they exceed 20. Each cluster is drawn as a circle around its pairs and named A, B, C, D from west to east.
  - Below that threshold of 20 no clusters are shown and the list holds individual pairs. The boundaries of the areas are still drawn so the area stays visible.
  - The hot-spot areas are the monitor's own site rectangles (name plus bounding box, in its `sts_watch` rules). This repo owns a copy of only the names and boxes, never the monitor's explanatory text. `malaysia_eopl` and `johor_east_scs` touch along one edge. A hot spot with no data is shown as its boundary and name only.

## listen.py
- Waits on the SQS queue that S3 notifies. One build per burst: the worker writes several Parquets per job, so collection continues until the queue has been quiet for `SETTLE_S` (10 s), never longer than `SETTLE_MAX_S` (60 s). `WAIT_S` is the SQS long-poll maximum (20 s).
- Messages are deleted only after the run succeeded; a failed run leaves them for redelivery, and the queue's redrive policy moves them to the dead-letter queue after 5 receives. Test events and keys outside `sts/*.parquet` are deleted immediately.
- SIGTERM is handled explicitly: the process is PID 1 in its container and would otherwise ignore it.
- A peek at the queue with `VisibilityTimeout=0` still counts as a receive; five of them send a message to the dead-letter queue.

## __main__.py
- `run` syncs from S3 and builds if anything changed, `build` rebuilds from the local mirror only, `listen` runs on S3 events.
- A file lock in the data dir keeps the listener and the hourly timer off the data at the same time. The timer only reconciles in case an event was missed.
