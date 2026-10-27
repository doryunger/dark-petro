import hashlib
import json
import logging
import math
import mimetypes
import re
from datetime import date, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import duckdb

log = logging.getLogger(__name__)

MAX_ZOOM = 14
TILE_PATH = re.compile(r"^/tiles/(?:(sanctioned|activity)/)?(\d{1,2})/(\d{1,5})/(\d{1,5})\.mvt$")
TRACK_PATH = re.compile(r"^/tracks/(\w{1,20})$")
ACTIVITY_PATH = re.compile(r"^/activities/(\w{1,20})$")
DATE_TEXT = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FINDING_ID_TEXT = re.compile(r"^[A-Za-z0-9_-]{1,200}$")
ALLOWED_PARAMS = {"from", "to", "source"}
MVT_TYPE = "application/vnd.mapbox-vector-tile"
TILE_MARGIN = 0.1
TILE_REVISION = 3

TILE_SQL = """
SELECT ST_AsMVT({%PROPS%}, '%LAYER%')
FROM (
  SELECT *,
    ST_AsMVTGeom(ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3857', always_xy := true), ST_Extent(ST_TileEnvelope(?, ?, ?))) AS geom
  FROM (
    SELECT *,
      strftime(capture_utc, '%Y-%m-%d') AS day,
      epoch(capture_utc)::BIGINT AS t%DERIVED%
    FROM (
      SELECT *%WINDOW%
      FROM read_parquet(?)
      WHERE true{extra}
    )
    WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?%HEAD%
  )
)
WHERE geom IS NOT NULL
"""

PAIR_PROPS = """
  'geom': geom, 'id': finding_id, 'date': day, 't': t, 'hot_spot': hot_spot, 'source': source,
  'sanctioned': sanctioned, 'image': capture_png, 'yaw': yaw, 'lon': round(lon, 6), 'lat': round(lat, 6),
  'v1_name': vessel_1_name, 'v1_flag': vessel_1_flag, 'v1_imo': vessel_1_imo, 'v1_sanctioned': v1_sanctioned,
  'v2_name': vessel_2_name, 'v2_flag': vessel_2_flag, 'v2_imo': vessel_2_imo, 'v2_sanctioned': v2_sanctioned
"""

PAIR_DERIVED = """,
      coalesce(vessel_1_is_sanctioned, false) AS v1_sanctioned,
      coalesce(vessel_2_is_sanctioned, false) AS v2_sanctioned,
      coalesce(vessel_1_is_sanctioned, false) OR coalesce(vessel_2_is_sanctioned, false) AS sanctioned"""

SANCTIONED_PROPS = """
  'geom': geom, 'id': finding_id, 'date': day, 't': t, 'hot_spot': hot_spot, 'source': source,
  'image': capture_png, 'yaw': yaw, 'lon': round(lon, 6), 'lat': round(lat, 6),
  'v1_name': vessel_name, 'v1_flag': vessel_flag, 'v1_imo': vessel_imo, 'n': n
"""

SANCTIONED_WINDOW = """,
      CASE WHEN vessel_imo IS NULL THEN 1 ELSE count(*) OVER (PARTITION BY vessel_imo) END AS n,
      CASE WHEN vessel_imo IS NULL THEN 1 ELSE row_number() OVER (PARTITION BY vessel_imo ORDER BY capture_utc DESC, finding_id) END AS head_rank"""

LAYERS = {
    "pairs": {"file": "findings.parquet", "sql": TILE_SQL.replace("%PROPS%", PAIR_PROPS).replace("%LAYER%", "pairs").replace("%DERIVED%", PAIR_DERIVED).replace("%WINDOW%", "").replace("%HEAD%", "")},
    "sanctioned": {"file": "sanctioned.parquet", "sql": TILE_SQL.replace("%PROPS%", SANCTIONED_PROPS).replace("%LAYER%", "sanctioned").replace("%DERIVED%", "").replace("%WINDOW%", SANCTIONED_WINDOW).replace("%HEAD%", " AND head_rank = 1")},
    "activity": {"file": "findings.parquet", "sql": TILE_SQL.replace("%PROPS%", PAIR_PROPS).replace("%LAYER%", "activity").replace("%DERIVED%", PAIR_DERIVED).replace("%WINDOW%", "").replace("%HEAD%", "")},
}


TRACK_SQL = """
SELECT finding_id, strftime(capture_utc, '%Y-%m-%d'), epoch(capture_utc)::BIGINT, hot_spot, source, capture_png, yaw,
  round(lon, 6), round(lat, 6), vessel_name, vessel_flag, vessel_imo
FROM read_parquet(?)
WHERE vessel_imo = ?{extra}
ORDER BY capture_utc DESC, finding_id
"""

ACTIVITY_SQL = """
SELECT finding_id, strftime(capture_utc, '%Y-%m-%d'), epoch(capture_utc)::BIGINT, hot_spot, source, capture_png,
  round(lon, 6), round(lat, 6),
  coalesce(vessel_1_is_sanctioned, false) OR coalesce(vessel_2_is_sanctioned, false),
  vessel_1_name, vessel_1_flag, vessel_1_imo, coalesce(vessel_1_is_sanctioned, false),
  vessel_2_name, vessel_2_flag, vessel_2_imo, coalesce(vessel_2_is_sanctioned, false)
FROM read_parquet(?)
WHERE (vessel_1_imo = ? OR vessel_2_imo = ?){extra}
ORDER BY capture_utc DESC, finding_id
"""

ACTIVITY_IMOS_SQL = """
SELECT DISTINCT s.vessel_imo
FROM read_parquet(?) s
WHERE s.vessel_imo IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM read_parquet(?) p
    WHERE (p.vessel_1_imo = s.vessel_imo OR p.vessel_2_imo = s.vessel_imo){extra}
  )
"""


class BadRequest(Exception):
    pass


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2 ** z
    west = x / n * 360 - 180
    east = (x + 1) / n * 360 - 180
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, south, east, north


def padded_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    west, south, east, north = tile_bounds(z, x, y)
    dx, dy = (east - west) * TILE_MARGIN, (north - south) * TILE_MARGIN
    return max(west - dx, -180.0), max(south - dy, -90.0), min(east + dx, 180.0), min(north + dy, 90.0)


def parse_tile_request(path: str) -> tuple[str, int, int, int]:
    m = TILE_PATH.match(path)
    if not m:
        raise BadRequest("not a tile path")
    z, x, y = (int(g) for g in m.groups()[1:])
    if z > MAX_ZOOM or x >= 2 ** z or y >= 2 ** z:
        raise BadRequest("tile out of range")
    return m.group(1) or "pairs", z, x, y


def known_sources(manifest: dict) -> list[str]:
    return sorted(set(manifest.get("by_source", {})) | set(manifest.get("sanctioned", {}).get("by_source", {})))


def date_range(manifest: dict) -> tuple[str, str] | None:
    ranges = [r for r in (manifest.get("time_range"), manifest.get("sanctioned", {}).get("time_range")) if r]
    if not ranges:
        return None
    return min(r[0] for r in ranges)[:10], max(r[1] for r in ranges)[:10]


def parse_day(text: str) -> date:
    if not DATE_TEXT.match(text):
        raise BadRequest("dates are YYYY-MM-DD")
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise BadRequest("not a calendar date") from None


def parse_filters(query: str, known_sources: list[str], include_sources: bool = True, include_id: bool = False) -> dict:
    params = parse_qs(query, keep_blank_values=True)
    allowed = ALLOWED_PARAMS if include_sources else ALLOWED_PARAMS - {"source"}
    if include_id:
        allowed = allowed | {"id"}
    extra = set(params) - allowed
    if extra:
        raise BadRequest(f"unknown parameter {sorted(extra)[0]}")
    if any(len(v) != 1 for v in params.values()):
        raise BadRequest("a parameter is given once")
    out = {"from": None, "to": None, "sources": None}
    if include_id:
        out["id"] = None
    if "from" in params:
        out["from"] = parse_day(params["from"][0])
    if "to" in params:
        out["to"] = parse_day(params["to"][0])
    if out["from"] and out["to"] and out["from"] > out["to"]:
        raise BadRequest("from is after to")
    if include_sources and "source" in params:
        wanted = [v for v in params["source"][0].split(",") if v]
        if not wanted or any(v not in known_sources for v in wanted):
            raise BadRequest("unknown source")
        out["sources"] = sorted(set(wanted))
    if include_id:
        finding_id = params.get("id", [""])[0]
        if not FINDING_ID_TEXT.fullmatch(finding_id):
            raise BadRequest("a valid activity id is required")
        out["id"] = finding_id
    return out


def filter_clause(filters: dict) -> tuple[str, list]:
    extra, args = "", []
    if filters["from"]:
        extra += " AND capture_utc >= ?::TIMESTAMPTZ"
        args.append(f"{filters['from'].isoformat()}T00:00:00+00:00")
    if filters["to"]:
        extra += " AND capture_utc < ?::TIMESTAMPTZ"
        args.append(f"{(filters['to'] + timedelta(days=1)).isoformat()}T00:00:00+00:00")
    if filters["sources"]:
        extra += " AND list_contains(?, source)"
        args.append(filters["sources"])
    return extra, args


def etag_for(build_id: str, path: str, query: str) -> str:
    key = f"{TILE_REVISION}|{build_id}|{path}|{'&'.join(sorted(query.split('&'))) if query else ''}"
    return '"' + hashlib.sha1(key.encode()).hexdigest()[:20] + '"'


class Store:
    def __init__(self, cfg):
        self.cfg = cfg
        self.con = duckdb.connect()
        self.con.execute("SET TimeZone = 'UTC'")
        self.con.execute("SET memory_limit = ?", [cfg.duckdb_memory])
        self.con.execute("SET threads = 2")
        self.con.execute("SET extension_directory = ?", [cfg.extension_dir])
        self.con.execute("SET autoinstall_known_extensions = false")
        self.con.execute("LOAD spatial")

    def manifest(self) -> dict | None:
        try:
            return json.loads((self.cfg.current / "manifest.json").read_text())
        except (FileNotFoundError, ValueError):
            return None

    def metadata(self) -> dict | None:
        m = self.manifest()
        span = date_range(m) if m else None
        if not span:
            return None
        return {"min_date": span[0], "max_date": span[1], "sources": known_sources(m)}

    def track(self, imo: str, filters: dict) -> list[dict]:
        source = self.cfg.current / "sanctioned.parquet"
        if not source.exists():
            return []
        extra, args = filter_clause(filters)
        cur = self.con.cursor()
        try:
            rows = cur.execute(TRACK_SQL.replace("{extra}", extra), [str(source), imo, *args]).fetchall()
        finally:
            cur.close()
        keys = ("id", "date", "t", "hot_spot", "source", "image", "yaw", "lon", "lat", "name", "flag", "imo")
        return [dict(zip(keys, r)) for r in rows]

    def activities(self, imo: str, filters: dict) -> list[dict]:
        source = self.cfg.current / "findings.parquet"
        if not source.exists():
            return []
        extra, args = filter_clause(filters)
        cur = self.con.cursor()
        try:
            rows = cur.execute(ACTIVITY_SQL.replace("{extra}", extra), [str(source), imo, imo, *args]).fetchall()
        finally:
            cur.close()
        keys = ("id", "date", "t", "hot_spot", "source", "image", "lon", "lat", "sanctioned", "v1_name", "v1_flag", "v1_imo", "v1_sanctioned", "v2_name", "v2_flag", "v2_imo", "v2_sanctioned")
        return [dict(zip(keys, row)) for row in rows]

    def activity_imos(self, filters: dict) -> list[str]:
        sanctioned = self.cfg.current / "sanctioned.parquet"
        findings = self.cfg.current / "findings.parquet"
        if not sanctioned.exists() or not findings.exists():
            return []
        extra, args = filter_clause(filters)
        cur = self.con.cursor()
        try:
            rows = cur.execute(ACTIVITY_IMOS_SQL.replace("{extra}", extra), [str(sanctioned), str(findings), *args]).fetchall()
        finally:
            cur.close()
        return [row[0] for row in rows]

    def tile(self, layer: str, z: int, x: int, y: int, filters: dict) -> bytes:
        source = self.cfg.current / LAYERS[layer]["file"]
        if not source.exists():
            return b""
        west, south, east, north = padded_bounds(z, x, y)
        extra, args = filter_clause(filters)
        if layer == "activity":
            extra += " AND finding_id = ?"
            args.append(filters["id"])
        cur = self.con.cursor()
        try:
            row = cur.execute(LAYERS[layer]["sql"].replace("{extra}", extra), [z, x, y, str(source), *args, west, east, south, north]).fetchone()
        finally:
            cur.close()
        return bytes(row[0]) if row and row[0] else b""


def safe_file(root: Path, relative: str) -> Path | None:
    candidate = (root / relative.lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def make_handler(store: Store):
    cfg = store.cfg

    class Handler(BaseHTTPRequestHandler):
        server_version = "sts-viewer"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            log.debug(fmt, *args)

        def send_bytes(self, status: int, body: bytes, content_type: str, headers: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def send_json(self, status: int, payload: dict, headers: dict | None = None):
            self.send_bytes(status, json.dumps(payload).encode(), "application/json", {"Cache-Control": "no-cache", **(headers or {})})

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            parts = urlsplit(self.path)
            path = unquote(parts.path)
            try:
                if path.startswith("/tiles/"):
                    return self.tile(path, parts.query)
                if path == "/metadata":
                    return self.metadata()
                if path == "/activity-imos":
                    return self.activity_imos(parts.query)
                if path.startswith("/tracks/"):
                    return self.track(path, parts.query)
                if path.startswith("/activities/"):
                    return self.activities(path, parts.query)
                if path.startswith("/captures/"):
                    return self.capture(path)
                return self.app(path)
            except BadRequest as e:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(e)})
            except Exception:
                log.exception("request failed")
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal error"})

        def tile(self, path: str, query: str):
            manifest = store.manifest()
            if not manifest:
                return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no data yet"})
            layer, z, x, y = parse_tile_request(path)
            filters = parse_filters(query, known_sources(manifest), include_sources=layer != "activity", include_id=layer == "activity")
            etag = etag_for(manifest["build_id"], path, query)
            if self.headers.get("If-None-Match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_bytes(HTTPStatus.OK, store.tile(layer, z, x, y, filters), MVT_TYPE, {"ETag": etag, "Cache-Control": "no-cache"})

        def track(self, path: str, query: str):
            manifest = store.manifest()
            if not manifest:
                return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no data yet"})
            m = TRACK_PATH.match(path)
            if not m:
                raise BadRequest("not a track path")
            filters = parse_filters(query, known_sources(manifest))
            self.send_json(HTTPStatus.OK, {"imo": m.group(1), "points": store.track(m.group(1), filters)})

        def activities(self, path: str, query: str):
            manifest = store.manifest()
            if not manifest:
                return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no data yet"})
            m = ACTIVITY_PATH.match(path)
            if not m:
                raise BadRequest("not an activity path")
            filters = parse_filters(query, known_sources(manifest), include_sources=False)
            self.send_json(HTTPStatus.OK, {"imo": m.group(1), "activities": store.activities(m.group(1), filters)})

        def activity_imos(self, query: str):
            manifest = store.manifest()
            if not manifest:
                return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no data yet"})
            filters = parse_filters(query, known_sources(manifest), include_sources=False)
            self.send_json(HTTPStatus.OK, {"imos": store.activity_imos(filters)})

        def metadata(self):
            meta = store.metadata()
            if not meta:
                return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no data yet"})
            self.send_json(HTTPStatus.OK, meta)

        def capture(self, path: str):
            f = safe_file(cfg.mirror / "captures", path[len("/captures/"):])
            if not f:
                return self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            kind = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            st = f.stat()
            etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}"'
            if self.headers.get("If-None-Match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_bytes(HTTPStatus.OK, f.read_bytes(), kind, {"ETag": etag, "Cache-Control": "no-cache"})

        def app(self, path: str):
            f = safe_file(cfg.app_dir, path)
            if f:
                kind = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                cache = "no-cache" if f.name == "index.html" else "public, max-age=31536000, immutable"
                return self.send_bytes(HTTPStatus.OK, f.read_bytes(), kind, {"Cache-Control": cache})
            index = safe_file(cfg.app_dir, "index.html")
            if index and "." not in path.rsplit("/", 1)[-1]:
                return self.send_bytes(HTTPStatus.OK, index.read_bytes(), "text/html; charset=utf-8", {"Cache-Control": "no-cache"})
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    return Handler


def serve(cfg) -> int:
    store = Store(cfg)
    server = ThreadingHTTPServer(("0.0.0.0", cfg.port), make_handler(store))
    log.info("serving on port %d", cfg.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
