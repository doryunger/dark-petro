import hashlib
import json
from datetime import datetime, timezone

VESSEL_MINZOOM = 10
SCHEMA_VERSION = 3


def input_hash(inputs: dict[str, str]) -> str:
    text = f"schema={SCHEMA_VERSION}\n" + "\n".join(f"{k}\t{inputs[k]}" for k in sorted(inputs))
    return hashlib.sha256(text.encode()).hexdigest()


INTERNAL_COLUMNS = ("job_id", "attempt_id", "review_prefix", "rules_sha256", "code_commit", "detector_revision", "run", "scene_id", "hull_id")


def measures(row: dict) -> dict:
    raw = row.get("measures")
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except ValueError:
        return {}


def hull_length_m(m: dict) -> float | None:
    lengths = [v for k, v in m.items() if k.endswith("length_m") and isinstance(v, (int, float))]
    return round(max(lengths), 1) if lengths else None


def day_number(t) -> int | None:
    return epoch(t) // 86400 if isinstance(t, datetime) else None


def epoch(t) -> int | None:
    return int(t.timestamp()) if isinstance(t, datetime) else None


def _vessel(row: dict, slot: int) -> dict:
    p = f"vessel_{slot}_"
    return {k[len(p):]: row.get(k) for k in row if k.startswith(p)}


def pair_props(row: dict) -> dict:
    v1, v2 = _vessel(row, 1), _vessel(row, 2)
    m = measures(row)
    t = row.get("capture_utc")
    props = {
        "id": row["finding_id"],
        "hot_spot": row.get("hot_spot"),
        "source": row.get("source"),
        "verdict": row.get("verdict"),
        "qa_status": row.get("qa_status"),
        "t": epoch(t),
        "day": day_number(t),
        "date": t.strftime("%Y-%m-%d") if isinstance(t, datetime) else None,
        "named": int(bool(v1.get("name"))) + int(bool(v2.get("name"))),
        "sanctioned": bool(v1.get("is_sanctioned") or v2.get("is_sanctioned")),
        "ais_covered": bool(row.get("ais_covered")),
        "length_m": hull_length_m(m),
        "v1_name": v1.get("name"),
        "v2_name": v2.get("name"),
        "v1_flag": v1.get("flag"),
        "v2_flag": v2.get("flag"),
    }
    return {k: v for k, v in props.items() if v is not None}


def point(lon: float, lat: float) -> dict:
    return {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]}


def features(row: dict) -> dict[str, list[dict]]:
    props = pair_props(row)
    out = {"pairs": [{"type": "Feature", "geometry": point(row["lon"], row["lat"]), "properties": props}], "vessels": [], "links": []}
    ends = []
    for slot in (1, 2):
        v = _vessel(row, slot)
        if v.get("lat") is None or v.get("lon") is None:
            continue
        ends.append([round(v["lon"], 7), round(v["lat"], 7)])
        vprops = {"id": props["id"], "slot": slot, "hot_spot": props.get("hot_spot"), "source": props.get("source"), "t": props.get("t"), "day": props.get("day"),
                  "name": v.get("name"), "flag": v.get("flag"), "sanctioned": bool(v.get("is_sanctioned"))}
        out["vessels"].append({"type": "Feature", "geometry": point(v["lon"], v["lat"]), "properties": {k: x for k, x in vprops.items() if x is not None},
                               "tippecanoe": {"minzoom": VESSEL_MINZOOM}})
    if len(ends) == 2:
        out["links"].append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": ends},
                             "properties": {"id": props["id"], "hot_spot": props.get("hot_spot"), "source": props.get("source"), "t": props.get("t"), "day": props.get("day")},
                             "tippecanoe": {"minzoom": VESSEL_MINZOOM}})
    return out


def index_entry(row: dict) -> dict:
    entry = {}
    for k, v in row.items():
        if k == "geometry" or k in INTERNAL_COLUMNS or k.startswith("_") or k == "source_key":
            continue
        entry[k] = v.isoformat() if isinstance(v, datetime) else v
    entry["measures"] = measures(row)
    entry["vessels"] = [_vessel(row, 1), _vessel(row, 2)]
    for k in [k for k in entry if k.startswith("vessel_")]:
        del entry[k]
    return entry


def captures(rows: list[dict]) -> set[str]:
    return {row[k] for row in rows for k in ("capture_png", "capture_markers_png") if row.get(k)}


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    seen: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: r.get("_source_mtime") or 0):
        seen[row["finding_id"]] = row
    return sorted(seen.values(), key=lambda r: (r.get("capture_utc") or datetime.min.replace(tzinfo=timezone.utc), r["finding_id"])), len(rows) - len(seen)
