import hashlib
import math
from datetime import datetime, timezone

SCHEMA_VERSION = 6


def input_hash(inputs: dict[str, str]) -> str:
    text = f"schema={SCHEMA_VERSION}\n" + "\n".join(f"{k}\t{inputs[k]}" for k in sorted(inputs))
    return hashlib.sha256(text.encode()).hexdigest()


INTERNAL_COLUMNS = ("job_id", "attempt_id", "review_prefix", "rules_sha256", "code_commit", "detector_revision", "run", "scene_id", "hull_id")


def yaw(row: dict) -> float | None:
    lat1, lon1 = row.get("vessel_1_lat"), row.get("vessel_1_lon")
    lat2, lon2 = row.get("vessel_2_lat"), row.get("vessel_2_lon")
    if None in (lat1, lon1, lat2, lon2):
        return None
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    bearing = math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)))
    return round((bearing + 90) % 360, 1)


def captures(rows: list[dict]) -> set[str]:
    return {row[k] for row in rows for k in ("capture_png", "capture_markers_png") if row.get(k)}


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    seen: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: r.get("_source_mtime") or 0):
        seen[row["finding_id"]] = row
    return sorted(seen.values(), key=lambda r: (r.get("capture_utc") or datetime.min.replace(tzinfo=timezone.utc), r["finding_id"])), len(rows) - len(seen)
