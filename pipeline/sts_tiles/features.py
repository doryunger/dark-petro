import hashlib
import json
import math
from pathlib import Path
from datetime import datetime, timezone

SCHEMA_VERSION = 14


def input_hash(inputs: dict[str, str]) -> str:
    text = f"schema={SCHEMA_VERSION}\n" + "\n".join(f"{k}\t{inputs[k]}" for k in sorted(inputs))
    return hashlib.sha256(text.encode()).hexdigest()


def hotspots_input(path: Path) -> dict[str, str]:
    try:
        return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()}
    except FileNotFoundError:
        return {}


def read_hotspots(path: Path) -> dict | None:
    try:
        raw = json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return None
    return raw if isinstance(raw, dict) else None


def number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def valid_box(box) -> bool:
    if not isinstance(box, (list, tuple)) or len(box) != 4 or not all(number(v) for v in box):
        return False
    west, south, east, north = box
    return -180 <= west < east <= 180 and -90 <= south < north <= 90


def hot_spot_label(site: dict) -> str:
    label = site.get("label")
    if isinstance(label, str) and label.strip():
        return label.strip()[:40]
    return " ".join(word.capitalize() for word in site["name"].split("_") if word)


def hot_spots(raw: dict | None) -> dict:
    sites = (raw or {}).get("sites")
    entries = sites.get("value") if isinstance(sites, dict) else None
    features = []
    for site in entries if isinstance(entries, list) else []:
        if not isinstance(site, dict) or not isinstance(site.get("name"), str) or not site["name"] or not valid_box(site.get("bbox")):
            continue
        west, south, east, north = (float(v) for v in site["bbox"])
        ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
        features.append({"type": "Feature", "properties": {"name": site["name"], "label": hot_spot_label(site)}, "geometry": {"type": "Polygon", "coordinates": [ring]}})
    return {"type": "FeatureCollection", "features": features}


def parquet_files(mirror: Path, *prefixes: str) -> list[Path]:
    return sorted(path for prefix in prefixes for path in (mirror / prefix).rglob("*.parquet"))


def local_inputs(mirror: Path, *prefixes: str) -> dict[str, str]:
    out = {}
    for path in parquet_files(mirror, *prefixes):
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                digest.update(chunk)
        out[path.relative_to(mirror).as_posix()] = digest.hexdigest()
    return out


def mirror_signature(mirror: Path, *prefixes: str) -> tuple:
    return tuple((p.as_posix(), st.st_size, st.st_mtime_ns) for p in parquet_files(mirror, *prefixes) for st in (p.stat(),))


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
