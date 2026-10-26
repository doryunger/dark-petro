import http.client
import json
import os
import tempfile
import threading
import unittest
from datetime import date, datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

import duckdb

from sts_tiles import build as B
from tests import mvt
from sts_tiles import serve as V
from sts_tiles.config import Config

EXTENSIONS = os.environ.get("STS_DUCKDB_EXTENSIONS", str(Path.home() / ".duckdb" / "extensions"))


def spatial_available() -> bool:
    try:
        con = duckdb.connect()
        con.execute("SET extension_directory = ?", [EXTENSIONS])
        con.execute("SET autoinstall_known_extensions = false")
        con.execute("LOAD spatial")
        return True
    except Exception:
        return False


def finding(n: int, source: str, day: int, **over) -> dict:
    base = {
        "finding_id": f"{source}_202610{day:02d}T060000_{n}", "lat": 24.6 + n / 1000, "lon": 57.5 + n / 1000, "hot_spot": "off_sohar", "source": source,
        "capture_utc": datetime(2026, 10, day, 6, 0, 0, tzinfo=timezone.utc), "capture_png": f"captures/{n}.png",
        "vessel_1_lat": 24.6, "vessel_1_lon": 57.5, "vessel_1_name": f"VESSEL ONE {n}", "vessel_1_flag": "PA", "vessel_1_is_sanctioned": False, "vessel_1_imo": 9123456,
        "vessel_2_lat": 24.6004, "vessel_2_lon": 57.5004, "vessel_2_name": None, "vessel_2_flag": "KM", "vessel_2_is_sanctioned": True,
    }
    return base | over


def sanctioned_finding(n: int, source: str, day: int, **over) -> dict:
    base = {
        "finding_id": f"{source}_202610{day:02d}T060000_w0-{n}", "lat": 25.1 + n / 1000, "lon": 56.5 + n / 1000, "hot_spot": "fujairah_outer", "source": source,
        "capture_utc": datetime(2026, 10, day, 6, 0, 0, tzinfo=timezone.utc), "capture_png": f"captures/s{n}.png",
        "vessel_name": f"SANCTIONED {n}", "vessel_flag": "ST", "vessel_imo": "9257149", "heading_deg": 45.0 if n == 1 else None,
    }
    return base | over


def make_config(root: Path) -> Config:
    return Config(bucket="", findings_prefix="sts/", data_dir=root, keep_builds=5, region=None, port=0, app_dir=root / "app",
                  extension_dir=EXTENSIONS, duckdb_memory="100MB", watch_s=1.0)


def make_data(root: Path, rows: list[dict], sanctioned: list[dict] | None = None) -> None:
    build = root / "builds" / "b1"
    build.mkdir(parents=True)
    B.write_table(rows, build / "findings.parquet")
    manifest = {"build_id": "b1", "by_source": {"s1": 1, "s2": 1}, "time_range": [min(r["capture_utc"] for r in rows).isoformat(), max(r["capture_utc"] for r in rows).isoformat()]}
    if sanctioned is not None:
        B.write_table(sanctioned, build / "sanctioned.parquet", B.SANCTIONED_TYPES)
        times = [r["capture_utc"] for r in sanctioned]
        manifest["sanctioned"] = {"by_source": {"s1": len(sanctioned)}, "time_range": [min(times).isoformat(), max(times).isoformat()] if times else None}
    (build / "manifest.json").write_text(json.dumps(manifest))
    (root / "current").symlink_to("builds/b1")
    (root / "mirror" / "captures").mkdir(parents=True)
    (root / "mirror" / "captures" / "1.png").write_bytes(b"png")
    (root / "app").mkdir()
    (root / "app" / "index.html").write_text("<!doctype html><title>app</title>")


class Parsing(unittest.TestCase):
    def test_tile_path(self):
        self.assertEqual(V.parse_tile_request("/tiles/5/10/12.mvt"), ("pairs", 5, 10, 12))
        self.assertEqual(V.parse_tile_request("/tiles/sanctioned/5/10/12.mvt"), ("sanctioned", 5, 10, 12))
        for bad in ("/tiles/15/0/0.mvt", "/tiles/1/2/0.mvt", "/tiles/a/0/0.mvt", "/tiles/1/0/0.png", "/tiles/1/0.mvt", "/tiles/other/1/0/0.mvt", "/tiles/sanctioned/15/0/0.mvt", "/tiles/sanctioned/sanctioned/1/0/0.mvt"):
            with self.assertRaises(V.BadRequest, msg=bad):
                V.parse_tile_request(bad)

    def test_metadata_spans_both_datasets(self):
        manifest = {"by_source": {"s2": 1}, "time_range": ["2026-10-10T06:00:00+00:00", "2026-10-22T06:00:00+00:00"],
                    "sanctioned": {"by_source": {"s1": 1}, "time_range": ["2026-10-05T06:00:00+00:00", "2026-10-20T06:00:00+00:00"]}}
        self.assertEqual(V.known_sources(manifest), ["s1", "s2"])
        self.assertEqual(V.date_range(manifest), ("2026-10-05", "2026-10-22"))
        self.assertEqual(V.date_range({"time_range": None, "sanctioned": manifest["sanctioned"]}), ("2026-10-05", "2026-10-20"))
        self.assertEqual(V.known_sources({"by_source": {"s1": 1}}), ["s1"])
        self.assertEqual(V.date_range({"time_range": ["2026-10-10T00:00:00+00:00", "2026-10-11T00:00:00+00:00"], "sanctioned": {"time_range": None}}), ("2026-10-10", "2026-10-11"))
        self.assertIsNone(V.date_range({"time_range": None}))

    def test_filters(self):
        f = V.parse_filters("from=2026-10-01&to=2026-10-24&source=s2,s1", ["s1", "s2"])
        self.assertEqual((f["from"], f["to"], f["sources"]), (date(2026, 10, 1), date(2026, 10, 24), ["s1", "s2"]))
        self.assertEqual(V.parse_filters("", ["s1"]), {"from": None, "to": None, "sources": None})

    def test_bad_filters(self):
        for bad in ("from=2026-13-01", "from=yesterday", "from=2026-10-05&to=2026-10-01", "source=s9", "source=", "source=s1&source=s2", "x=1", "to=2026-1-1"):
            with self.assertRaises(V.BadRequest, msg=bad):
                V.parse_filters(bad, ["s1", "s2"])

    def test_etag_ignores_parameter_order_and_follows_the_build(self):
        a = V.etag_for("b1", "/tiles/0/0/0.mvt", "from=2026-10-01&to=2026-10-02")
        self.assertEqual(a, V.etag_for("b1", "/tiles/0/0/0.mvt", "to=2026-10-02&from=2026-10-01"))
        self.assertNotEqual(a, V.etag_for("b2", "/tiles/0/0/0.mvt", "from=2026-10-01&to=2026-10-02"))

    def test_tile_bounds(self):
        west, south, east, north = V.tile_bounds(0, 0, 0)
        self.assertEqual((west, east), (-180.0, 180.0))
        self.assertAlmostEqual(north, 85.0511, places=3)
        self.assertAlmostEqual(south, -85.0511, places=3)
        west, south, east, north = V.padded_bounds(0, 0, 0)
        self.assertEqual((west, east), (-180.0, 180.0))

    def test_files_stay_inside_their_folder(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "pub"
            root.mkdir()
            (root / "a.png").write_bytes(b"x")
            (Path(d) / "secret.txt").write_text("s")
            self.assertEqual(V.safe_file(root, "a.png"), (root / "a.png").resolve())
            self.assertIsNone(V.safe_file(root, "../secret.txt"))
            self.assertIsNone(V.safe_file(root, "missing.png"))


@unittest.skipUnless(spatial_available(), "the DuckDB spatial extension is not installed")
class Serving(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        make_data(root, [finding(1, "s1", 10), finding(2, "s2", 20), finding(3, "s2", 22, vessel_1_lat=None)], [sanctioned_finding(1, "s1", 12), sanctioned_finding(2, "s1", 21)])
        cls.cfg = make_config(root)
        cls.store = V.Store(cls.cfg)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), V.make_handler(cls.store))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def get(self, path, headers=None, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1])
        conn.request(method, path, headers=headers or {})
        r = conn.getresponse()
        body = r.read()
        conn.close()
        return r.status, dict(r.getheaders()), body

    def test_metadata(self):
        status, _, body = self.get("/metadata")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"min_date": "2026-10-10", "max_date": "2026-10-22", "sources": ["s1", "s2"]})

    def test_tile_carries_every_attribute_the_app_reads(self):
        status, headers, body = self.get("/tiles/0/0/0.mvt")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], V.MVT_TYPE)
        self.assertEqual(headers["Cache-Control"], "no-cache")
        features = {f["id"]: f for f in mvt.decode(body)}
        self.assertEqual(set(features), {"s1_20261010T060000_1", "s2_20261020T060000_2", "s2_20261022T060000_3"})
        one = features["s1_20261010T060000_1"]
        self.assertEqual(one["date"], "2026-10-10")
        self.assertEqual(one["t"], 1791612000)
        self.assertEqual((one["hot_spot"], one["source"], one["image"]), ("off_sohar", "s1", "captures/1.png"))
        self.assertEqual((one["v1_name"], one["v1_flag"], one["v1_imo"], one["v1_sanctioned"]), ("VESSEL ONE 1", "PA", "9123456", False))
        self.assertEqual((one["v2_flag"], one["v2_sanctioned"], one["sanctioned"]), ("KM", True, True))
        self.assertIn("yaw", one)
        self.assertEqual((one["lon"], one["lat"]), (57.501, 24.601))
        self.assertNotIn("v2_name", one)
        self.assertNotIn("v2_imo", one)

    def test_filters_narrow_the_tile(self):
        _, _, body = self.get("/tiles/0/0/0.mvt?from=2026-10-20&to=2026-10-21&source=s2")
        self.assertEqual([f["id"] for f in mvt.decode(body)], ["s2_20261020T060000_2"])

    def test_the_end_date_is_inclusive(self):
        _, _, body = self.get("/tiles/0/0/0.mvt?from=2026-10-22&to=2026-10-22")
        self.assertEqual([f["id"] for f in mvt.decode(body)], ["s2_20261022T060000_3"])

    def test_sanctioned_tile_is_its_own_layer_with_the_vessel_attributes(self):
        status, headers, body = self.get("/tiles/sanctioned/0/0/0.mvt")
        self.assertEqual((status, headers["Content-Type"]), (200, V.MVT_TYPE))
        features = {f["id"]: f for f in mvt.decode(body)}
        self.assertEqual(set(features), {"s1_20261012T060000_w0-1", "s1_20261021T060000_w0-2"})
        one = features["s1_20261012T060000_w0-1"]
        self.assertEqual((one["date"], one["hot_spot"], one["source"], one["image"]), ("2026-10-12", "fujairah_outer", "s1", "captures/s1.png"))
        self.assertEqual((one["v1_name"], one["v1_flag"], one["v1_imo"]), ("SANCTIONED 1", "ST", "9257149"))
        self.assertAlmostEqual(one["lon"], 56.501, places=6)
        self.assertIn("t", one)
        self.assertNotIn("v2_name", one)
        self.assertEqual(one["yaw"], 45.0)
        self.assertNotIn("yaw", features["s1_20261021T060000_w0-2"])

    def test_pairs_and_sanctioned_vessels_stay_apart(self):
        _, _, pairs = self.get("/tiles/0/0/0.mvt")
        self.assertFalse([f for f in mvt.decode(pairs) if "w0-" in f["id"]])

    def test_filters_narrow_the_sanctioned_tile_too(self):
        _, _, body = self.get("/tiles/sanctioned/0/0/0.mvt?from=2026-10-20&to=2026-10-21&source=s1")
        self.assertEqual([f["id"] for f in mvt.decode(body)], ["s1_20261021T060000_w0-2"])
        _, _, body = self.get("/tiles/sanctioned/0/0/0.mvt?source=s2")
        self.assertEqual(mvt.decode(body), [])

    def test_a_sanctioned_tile_elsewhere_is_empty(self):
        _, _, body = self.get("/tiles/sanctioned/6/0/0.mvt")
        self.assertEqual(mvt.decode(body), [])

    def test_a_pair_without_positions_has_no_yaw_but_is_still_there(self):
        _, _, body = self.get("/tiles/0/0/0.mvt?from=2026-10-22&to=2026-10-22")
        (feature,) = mvt.decode(body)
        self.assertNotIn("yaw", feature)

    def test_a_tile_elsewhere_is_empty(self):
        _, _, body = self.get("/tiles/6/0/0.mvt")
        self.assertEqual(mvt.decode(body), [])

    def test_revalidation(self):
        _, headers, _ = self.get("/tiles/0/0/0.mvt")
        status, _, body = self.get("/tiles/0/0/0.mvt", {"If-None-Match": headers["ETag"]})
        self.assertEqual((status, body), (304, b""))

    def test_bad_requests(self):
        for path in ("/tiles/0/0/0.mvt?source=s9", "/tiles/0/0/0.mvt?from=x", "/tiles/20/0/0.mvt", "/tiles/0/0/0.mvt?extra=1"):
            self.assertEqual(self.get(path)[0], 400, path)

    def test_captures_and_the_app(self):
        status, headers, body = self.get("/captures/1.png")
        self.assertEqual((status, body, headers["Content-Type"]), (200, b"png", "image/png"))
        self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertEqual(self.get("/captures/1.png", {"If-None-Match": headers["ETag"]})[0], 304)
        self.assertEqual(self.get("/captures/2.png")[0], 404)
        self.assertEqual(self.get("/captures/../../builds/b1/findings.parquet")[0], 404)
        status, headers, body = self.get("/anything/deep")
        self.assertEqual((status, headers["Cache-Control"]), (200, "no-cache"))
        self.assertIn(b"<title>app</title>", body)
        self.assertEqual(self.get("/missing.js")[0], 404)

    def test_head_has_no_body(self):
        status, headers, body = self.get("/metadata", method="HEAD")
        self.assertEqual((status, body), (200, b""))
        self.assertGreater(int(headers["Content-Length"]), 0)


@unittest.skipUnless(spatial_available(), "the DuckDB spatial extension is not installed")
class BuildWithoutSanctioned(unittest.TestCase):
    def test_a_build_from_before_the_tab_gives_an_empty_tile(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            make_data(root, [finding(1, "s1", 10)])
            store = V.Store(make_config(root))
            self.assertEqual(store.tile("sanctioned", 0, 0, 0, {"from": None, "to": None, "sources": None}), b"")
            self.assertTrue(store.tile("pairs", 0, 0, 0, {"from": None, "to": None, "sources": None}))


if __name__ == "__main__":
    unittest.main()
