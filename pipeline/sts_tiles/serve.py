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
TILE_PATH = re.compile(r"^/tiles/(?:(sanctioned)/)?(\d{1,2})/(\d{1,5})/(\d{1,5})\.mvt$")
DATE_TEXT = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ALLOWED_PARAMS = {"from", "to", "source"}
MVT_TYPE = "application/vnd.mapbox-vector-tile"
TILE_MARGIN = 0.1

TILE_SQL = """
SELECT ST_AsMVT({%PROPS%}, '%LAYER%')
FROM (
  SELECT *,
    ST_AsMVTGeom(ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3857', always_xy := true), ST_Extent(ST_TileEnvelope(?, ?, ?))) AS geom
  FROM (
    SELECT *,
      strftime(capture_utc, '%Y-%m-%d') AS day,
      epoch(capture_utc)::BIGINT AS t%DERIVED%
    FROM read_parquet(?)
    WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?{extra}
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
  'v1_name': vessel_name, 'v1_flag': vessel_flag, 'v1_imo': vessel_imo
"""

LAYERS = {
    "pairs": {"file": "findings.parquet", "sql": TILE_SQL.replace("%PROPS%", PAIR_PROPS).replace("%LAYER%", "pairs").replace("%DERIVED%", PAIR_DERIVED)},
    "sanctioned": {"file": "sanctioned.parquet", "sql": TILE_SQL.replace("%PROPS%", SANCTIONED_PROPS).replace("%LAYER%", "sanctioned").replace("%DERIVED%", "")},
}


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


def parse_filters(query: str, known_sources: list[str]) -> dict:
    params = parse_qs(query, keep_blank_values=True)
    extra = set(params) - ALLOWED_PARAMS
    if extra:
        raise BadRequest(f"unknown parameter {sorted(extra)[0]}")
    if any(len(v) != 1 for v in params.values()):
        raise BadRequest("a parameter is given once")
    out = {"from": None, "to": None, "sources": None}
    if "from" in params:
        out["from"] = parse_day(params["from"][0])
    if "to" in params:
        out["to"] = parse_day(params["to"][0])
    if out["from"] and out["to"] and out["from"] > out["to"]:
        raise BadRequest("from is after to")
    if "source" in params:
        wanted = [v for v in params["source"][0].split(",") if v]
        if not wanted or any(v not in known_sources for v in wanted):
            raise BadRequest("unknown source")
        out["sources"] = sorted(set(wanted))
    return out


def etag_for(build_id: str, path: str, query: str) -> str:
    key = f"{build_id}|{path}|{'&'.join(sorted(query.split('&'))) if query else ''}"
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

    def tile(self, layer: str, z: int, x: int, y: int, filters: dict) -> bytes:
        source = self.cfg.current / LAYERS[layer]["file"]
        if not source.exists():
            return b""
        west, south, east, north = padded_bounds(z, x, y)
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
        cur = self.con.cursor()
        try:
            row = cur.execute(LAYERS[layer]["sql"].replace("{extra}", extra), [z, x, y, str(source), west, east, south, north, *args]).fetchone()
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
            filters = parse_filters(query, known_sources(manifest))
            etag = etag_for(manifest["build_id"], path, query)
            if self.headers.get("If-None-Match") == etag:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_bytes(HTTPStatus.OK, store.tile(layer, z, x, y, filters), MVT_TYPE, {"ETag": etag, "Cache-Control": "no-cache"})

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
