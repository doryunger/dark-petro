import hashlib
import math
from pathlib import Path
from datetime import datetime, timezone

SCHEMA_VERSION = 11


def input_hash(inputs: dict[str, str]) -> str:
    text = f"schema={SCHEMA_VERSION}\n" + "\n".join(f"{k}\t{inputs[k]}" for k in sorted(inputs))
    return hashlib.sha256(text.encode()).hexdigest()


def parquet_files(mirror: Path, prefix: str) -> list[Path]:
    return sorted((mirror / prefix).rglob("*.parquet"))


def local_inputs(mirror: Path, prefix: str) -> dict[str, str]:
    out = {}
    for path in parquet_files(mirror, prefix):
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                digest.update(chunk)
        out[path.relative_to(mirror).as_posix()] = digest.hexdigest()
    return out


def mirror_signature(mirror: Path, prefix: str) -> tuple:
    return tuple((p.as_posix(), st.st_size, st.st_mtime_ns) for p in parquet_files(mirror, prefix) for st in (p.stat(),))


def rotation(row: dict) -> float | None:
    heading = row.get("heading_deg")
    if heading is not None:
        return round(heading % 360, 1)
    return yaw(row)


def yaw(row: dict) -> float | None:
    lat1, lon1 = row.get("vessel_1_lat"), row.get("vessel_1_lon")
    lat2, lon2 = row.get("vessel_2_lat"), row.get("vessel_2_lon")
    if None in (lat1, lon1, lat2, lon2):
        return None
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    bearing = math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)))
    return round((bearing + 90) % 360, 1)


def captures(rows: list[dict]) -> set[str]:
    return {row["capture_png"] for row in rows if row.get("capture_png")}


def visible(rows: list[dict]) -> list[dict]:
    return [row for row in rows if row.get("qa_status") != "rejected"]


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    seen: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: r.get("_source_mtime") or 0):
        seen[row["finding_id"]] = row
    return sorted(seen.values(), key=lambda r: (r.get("capture_utc") or datetime.min.replace(tzinfo=timezone.utc), r["finding_id"])), len(rows) - len(seen)
