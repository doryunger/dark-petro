import io
import json
import logging
import tempfile
import unittest
from pathlib import Path

from sts_tiles import build as B
from sts_tiles import features as F
from sts_tiles import sync as S
from tests.test_serve import finding, make_config


RAW = {
    "basis": "internal note",
    "min_shore_distance_m": {"value": 2000},
    "sites": {
        "basis": "internal note",
        "value": [
            {"name": "off_sohar", "label": "Sohar", "bbox": [56.6, 24.2, 57.6, 24.9], "basis": "internal note", "min_shore_distance_m": {"value": 1000}},
            {"name": "sikka_vadinar", "label": "Sikka", "bbox": [69.3, 22.35, 70.0, 22.68]},
        ],
    },
}


class FakeS3:
    def __init__(self, body=None, error=None):
        self.body, self.error, self.calls = body, error, []

    def get_object(self, Bucket, Key):
        self.calls.append((Bucket, Key))
        if self.error:
            raise self.error
        return {"Body": io.BytesIO(self.body)}


class HotSpotShapes(unittest.TestCase):
    def test_every_site_becomes_a_box_with_its_name_and_its_one_word_label_and_nothing_else(self):
        collection = F.hot_spots(RAW)
        self.assertEqual(collection["type"], "FeatureCollection")
        self.assertEqual([f["properties"] for f in collection["features"]], [{"name": "off_sohar", "label": "Sohar"}, {"name": "sikka_vadinar", "label": "Sikka"}])
        sikka = collection["features"][1]["geometry"]
        self.assertEqual(sikka["type"], "Polygon")
        self.assertEqual(sikka["coordinates"][0], [[69.3, 22.35], [70.0, 22.35], [70.0, 22.68], [69.3, 22.68], [69.3, 22.35]])
        text = json.dumps(collection)
        self.assertNotIn("internal note", text)
        self.assertNotIn("min_shore", text)
        self.assertNotIn("bbox", text)

    def test_the_label_comes_from_the_list_trimmed_and_an_area_without_one_gets_a_readable_name(self):
        raw = {"sites": {"value": [
            {"name": "off_sohar", "bbox": [1, 2, 3, 4], "label": "  Suhar "},
            {"name": "off_sohar", "bbox": [1, 2, 3, 4], "label": "   "},
            {"name": "off_sohar", "bbox": [1, 2, 3, 4], "label": 7},
            {"name": "bab_el_mandeb_north", "bbox": [1, 2, 3, 4]},
            {"name": "long", "bbox": [1, 2, 3, 4], "label": "x" * 80},
        ]}}
        self.assertEqual([f["properties"]["label"] for f in F.hot_spots(raw)["features"]], ["Suhar", "Off Sohar", "Off Sohar", "Bab El Mandeb North", "x" * 40])

    def test_a_site_that_is_not_a_proper_box_is_left_out_and_the_rest_stay(self):
        raw = {"sites": {"value": [
            {"name": "ok", "bbox": [1, 2, 3, 4]},
            {"name": "", "bbox": [1, 2, 3, 4]},
            {"bbox": [1, 2, 3, 4]},
            {"name": "short", "bbox": [1, 2, 3]},
            {"name": "text", "bbox": ["1", 2, 3, 4]},
            {"name": "flat", "bbox": [1, 2, 1, 4]},
            {"name": "upside_down", "bbox": [1, 4, 3, 2]},
            {"name": "off_the_globe", "bbox": [1, 2, 3, 95]},
            {"name": "flag", "bbox": [True, 2, 3, 4]},
            "not a site",
        ]}}
        self.assertEqual([f["properties"]["name"] for f in F.hot_spots(raw)["features"]], ["ok"])

    def test_nothing_usable_gives_an_empty_collection(self):
        for raw in (None, {}, {"sites": None}, {"sites": {"value": "x"}}, {"sites": {"value": []}}, {"sites": []}):
            self.assertEqual(F.hot_spots(raw), {"type": "FeatureCollection", "features": []})

    def test_reading_a_missing_or_broken_file_gives_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "hotspots.json"
            self.assertIsNone(F.read_hotspots(path))
            path.write_text("{not json")
            self.assertIsNone(F.read_hotspots(path))
            path.write_text("[1]")
            self.assertIsNone(F.read_hotspots(path))
            path.write_text(json.dumps(RAW))
            self.assertEqual(F.read_hotspots(path), RAW)


class HotSpotInput(unittest.TestCase):
    def test_the_hot_spot_file_changes_the_input_hash_so_a_new_area_rebuilds(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "hotspots.json"
            self.assertEqual(F.hotspots_input(path), {})
            path.write_text("one")
            first = F.hotspots_input(path)
            self.assertEqual(list(first), ["hotspots.json"])
            path.write_text("two")
            second = F.hotspots_input(path)
            self.assertNotEqual(first, second)
            self.assertNotEqual(F.input_hash(first), F.input_hash(second))
            self.assertNotEqual(F.input_hash({}), F.input_hash(first))


class HotSpotSync(unittest.TestCase):
    def test_a_new_file_is_written_and_the_same_file_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "mirror" / "hotspots.json"
            body = json.dumps(RAW).encode()
            s3 = FakeS3(body)
            self.assertEqual(S.sync_hotspots(s3, "bucket", "key", target), "fetched")
            self.assertEqual(target.read_bytes(), body)
            self.assertEqual(s3.calls, [("bucket", "key")])
            mtime = target.stat().st_mtime_ns
            self.assertEqual(S.sync_hotspots(s3, "bucket", "key", target), "unchanged")
            self.assertEqual(target.stat().st_mtime_ns, mtime)
            s3.body = json.dumps({"sites": {"value": []}}).encode()
            self.assertEqual(S.sync_hotspots(s3, "bucket", "key", target), "fetched")
            self.assertEqual(json.loads(target.read_text()), {"sites": {"value": []}})

    def test_a_failed_fetch_keeps_the_last_good_file_and_does_not_stop_the_run(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "hotspots.json"
            target.write_text(json.dumps(RAW))
            with self.assertLogs("sts_tiles.sync", level=logging.WARNING):
                self.assertEqual(S.refresh_hotspots(FakeS3(error=PermissionError("denied")), "bucket", "key", target), "failed")
            self.assertEqual(json.loads(target.read_text()), RAW)

    def test_a_reply_that_is_not_json_is_not_kept(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "hotspots.json"
            with self.assertLogs("sts_tiles.sync", level=logging.WARNING):
                self.assertEqual(S.refresh_hotspots(FakeS3(b"<html>"), "bucket", "key", target), "failed")
            self.assertFalse(target.exists())


class HotSpotBuild(unittest.TestCase):
    def test_a_build_carries_the_areas_and_names_the_file_in_its_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            cfg = make_config(root)
            out = B.build(cfg, {"sts/a.parquet": "x"}, [finding(1, "s1", 10)], [], [], F.hot_spots(RAW))
            self.assertEqual([f["properties"]["name"] for f in json.loads((out / "hot_spots.json").read_text())["features"]], ["off_sohar", "sikka_vadinar"])
            self.assertEqual(json.loads((out / "manifest.json").read_text())["files"]["hot_spots"], "hot_spots.json")

    def test_a_build_without_areas_still_writes_an_empty_collection(self):
        with tempfile.TemporaryDirectory() as d:
            out = B.build(make_config(Path(d)), {"sts/a.parquet": "x"}, [finding(1, "s1", 10)], [], [])
            self.assertEqual(json.loads((out / "hot_spots.json").read_text()), {"type": "FeatureCollection", "features": []})


if __name__ == "__main__":
    unittest.main()
