import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq

from sts_tiles import build as B
from sts_tiles import features as F


def row(**over):
    base = {
        "finding_id": "s2_20261021T065238_56045-272349", "lat": 24.6244, "lon": 57.5973, "hot_spot": "off_sohar", "source": "s2",
        "capture_utc": datetime(2026, 10, 21, 6, 52, 38, tzinfo=timezone.utc), "verdict": "pair", "qa_status": "unreviewed",
        "measures": '{"hull_a_length_m": 367.5, "hull_b_length_m": 146.1, "width_ratio": 1.2}', "ais_covered": True,
        "vessel_1_lat": 24.6245, "vessel_1_lon": 57.5973, "vessel_1_name": None, "vessel_1_flag": None, "vessel_1_is_sanctioned": False,
        "vessel_2_lat": 24.6251, "vessel_2_lon": 57.5972, "vessel_2_name": "ASTRO SIRIUS", "vessel_2_flag": "TV", "vessel_2_is_sanctioned": False,
        "capture_png": "captures/a.png", "capture_markers_png": "captures/a_markers.png",
    }
    return base | over


class Features(unittest.TestCase):
    def test_input_hash_is_order_free_and_etag_sensitive(self):
        a = F.input_hash({"x": "1", "y": "2"})
        self.assertEqual(a, F.input_hash({"y": "2", "x": "1"}))
        self.assertNotEqual(a, F.input_hash({"x": "1", "y": "3"}))

    def test_dedupe_keeps_newest_file(self):
        rows, dropped = F.dedupe([row(_source_mtime=1, qa_status="old"), row(_source_mtime=2, qa_status="new")])
        self.assertEqual((len(rows), dropped, rows[0]["qa_status"]), (1, 1, "new"))

    def test_captures(self):
        self.assertEqual(F.captures([row(), row(capture_markers_png=None)]), {"captures/a.png", "captures/a_markers.png"})


class Table(unittest.TestCase):
    def test_parquet_has_no_internal_columns(self):
        rows = [row(job_id="j", attempt_id="a", review_prefix="catalogue/x/", code_commit="c", rules_sha256="r", scene_id="S2", _source_mtime=1, source_key="sts/x.parquet")]
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "findings.parquet"
            B.write_table(rows, target)
            names = pq.read_table(target).column_names
        for k in (*F.INTERNAL_COLUMNS, "_source_mtime", "source_key"):
            self.assertNotIn(k, names)
        self.assertIn("finding_id", names)
        self.assertIn("capture_png", names)


if __name__ == "__main__":
    unittest.main()
