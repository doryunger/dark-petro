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
        "capture_png": "captures/a.png",
    }
    return base | over


def single(**over):
    base = {
        "finding_id": "s1_20261019T141603_w0-44977-274982", "lat": 24.8626, "lon": 56.5028, "hot_spot": "fujairah_outer", "source": "s1",
        "capture_utc": datetime(2026, 10, 19, 14, 16, 3, tzinfo=timezone.utc), "verdict": "single", "qa_status": "unreviewed",
        "vessel_lat": 24.8624, "vessel_lon": 56.5030, "vessel_name": "NESO", "vessel_flag": "ST", "vessel_imo": "9257149", "vessel_is_sanctioned": True,
        "vessel_sanctions_lists": "OFAC", "vessel_sanctions_programs": "IRAN-EO13902", "vessel_mmsi": "123", "capture_png": "captures/b.png",
    }
    return base | over


class Features(unittest.TestCase):
    def test_rejected_findings_are_hidden_and_the_others_stay(self):
        rows = [row(finding_id=f"s1_1_{s}", qa_status=s) for s in ("confirmed", "rejected", "corrected", "unreviewed", None)]
        self.assertEqual([r["finding_id"] for r in F.visible(rows)], ["s1_1_confirmed", "s1_1_corrected", "s1_1_unreviewed", "s1_1_None"])

    def test_a_later_rejection_hides_a_pair_that_was_published_before(self):
        old = row(qa_status="confirmed", _source_mtime=1)
        new = row(qa_status="rejected", _source_mtime=2)
        kept, _ = F.dedupe([old, new])
        self.assertEqual(F.visible(kept), [])
        kept, _ = F.dedupe([row(qa_status="rejected", _source_mtime=1), row(qa_status="corrected", _source_mtime=2)])
        self.assertEqual(len(F.visible(kept)), 1)

    def test_input_hash_is_order_free_and_etag_sensitive(self):
        a = F.input_hash({"x": "1", "y": "2"})
        self.assertEqual(a, F.input_hash({"y": "2", "x": "1"}))
        self.assertNotEqual(a, F.input_hash({"x": "1", "y": "3"}))

    def test_dedupe_keeps_newest_file(self):
        rows, dropped = F.dedupe([row(_source_mtime=1, qa_status="old"), row(_source_mtime=2, qa_status="new")])
        self.assertEqual((len(rows), dropped, rows[0]["qa_status"]), (1, 1, "new"))

    def test_yaw_is_the_pair_axis(self):
        east = row(vessel_1_lat=10.0, vessel_1_lon=50.0, vessel_2_lat=10.0, vessel_2_lon=50.001)
        north = row(vessel_1_lat=10.0, vessel_1_lon=50.0, vessel_2_lat=10.001, vessel_2_lon=50.0)
        west = row(vessel_1_lat=10.0, vessel_1_lon=50.0, vessel_2_lat=10.0, vessel_2_lon=49.999)
        self.assertAlmostEqual(F.yaw(east), 180.0, delta=0.2)
        self.assertAlmostEqual(F.yaw(north), 90.0, delta=0.2)
        self.assertLess(min(F.yaw(west), 360 - F.yaw(west)), 0.2)

    def test_rotation_takes_the_published_heading_and_falls_back_to_the_pair_axis(self):
        self.assertEqual(F.rotation(row(heading_deg=22.04)), 22.0)
        self.assertEqual(F.rotation(row(heading_deg=0.0)), 0.0)
        self.assertEqual(F.rotation(row(heading_deg=None)), F.yaw(row()))
        self.assertIsNone(F.rotation(row(heading_deg=None, vessel_2_lat=None)))

    def test_yaw_is_empty_without_both_positions(self):
        self.assertIsNone(F.yaw(row(vessel_2_lat=None)))
        self.assertIsNone(F.yaw(row(vessel_1_lon=None)))

    def test_sanctioned_vessels_are_deduped_and_filtered_like_pairs(self):
        old = single(qa_status="confirmed", _source_mtime=1)
        new = single(qa_status="rejected", _source_mtime=2)
        kept, dropped = F.dedupe([old, new])
        self.assertEqual((F.visible(kept), dropped), ([], 1))

    def test_captures(self):
        self.assertEqual(F.captures([row(), row(capture_png=None)]), {"captures/a.png"})


class LocalInputs(unittest.TestCase):
    def test_hash_follows_the_file_content_not_the_s3_etag(self):
        with tempfile.TemporaryDirectory() as d:
            mirror = Path(d)
            f = mirror / "sts" / "2026-10-01" / "off_sohar" / "s1.parquet"
            f.parent.mkdir(parents=True)
            f.write_bytes(b"one")
            a = F.local_inputs(mirror, "sts/")
            sig = F.mirror_signature(mirror, "sts/")
            self.assertEqual(list(a), ["sts/2026-10-01/off_sohar/s1.parquet"])
            self.assertEqual(a, F.local_inputs(mirror, "sts/"))
            f.write_bytes(b"two!")
            self.assertNotEqual(a, F.local_inputs(mirror, "sts/"))
            self.assertNotEqual(sig, F.mirror_signature(mirror, "sts/"))

    def test_both_prefixes_are_hashed(self):
        with tempfile.TemporaryDirectory() as d:
            mirror = Path(d)
            for key in ("sts/2026-10-01/off_sohar/s1.parquet", "sanctioned/2026-10-01/off_sohar/s1.parquet"):
                (mirror / key).parent.mkdir(parents=True)
                (mirror / key).write_bytes(b"x")
            self.assertEqual(list(F.local_inputs(mirror, "sts/", "sanctioned/")), ["sanctioned/2026-10-01/off_sohar/s1.parquet", "sts/2026-10-01/off_sohar/s1.parquet"])
            self.assertEqual(len(F.mirror_signature(mirror, "sts/", "sanctioned/")), 2)
            self.assertEqual(len(F.mirror_signature(mirror, "sts/")), 1)


class Table(unittest.TestCase):
    def test_parquet_has_only_the_columns_the_tiles_read(self):
        rows = [row(job_id="j", review_prefix="catalogue/x/", verdict="v", _source_mtime=1, source_key="sts/x.parquet")]
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "findings.parquet"
            B.write_table(rows, target)
            names = pq.read_table(target).column_names
        self.assertEqual(set(names), set(B.TABLE_TYPES))

    def test_parquet_has_every_column_the_tiles_read(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "findings.parquet"
            B.write_table([row()], target)
            schema = pq.read_table(target).schema
        for name, kind in B.TABLE_TYPES.items():
            self.assertEqual(schema.field(name).type, kind, name)

    def test_sanctioned_parquet_has_only_the_columns_the_tiles_read(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "sanctioned.parquet"
            B.write_table([single(vessel_imo=9257149)], target, B.SANCTIONED_TYPES)
            table = pq.read_table(target)
        self.assertEqual(set(table.column_names), set(B.SANCTIONED_TYPES))
        for name, kind in B.SANCTIONED_TYPES.items():
            self.assertEqual(table.schema.field(name).type, kind, name)
        self.assertEqual(table.column("vessel_imo").to_pylist(), ["9257149"])

    def test_sanctioned_vessel_yaw_is_the_published_heading_and_empty_without_one(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "sanctioned.parquet"
            B.write_table([single(heading_deg=93.26), single(finding_id="b", heading_deg=None), single(finding_id="c")], target, B.SANCTIONED_TYPES)
            self.assertEqual(pq.read_table(target).column("yaw").to_pylist(), [93.3, None, None])

    def test_no_sanctioned_vessels_still_writes_the_table(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "sanctioned.parquet"
            B.write_table([], target, B.SANCTIONED_TYPES)
            table = pq.read_table(target)
        self.assertEqual((table.num_rows, set(table.column_names)), (0, set(B.SANCTIONED_TYPES)))

    def test_integer_imo_becomes_text(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "findings.parquet"
            B.write_table([row(vessel_1_imo=9123456)], target)
            self.assertEqual(pq.read_table(target).column("vessel_1_imo").to_pylist(), ["9123456"])


if __name__ == "__main__":
    unittest.main()
