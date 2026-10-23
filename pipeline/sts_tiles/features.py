import hashlib
from datetime import datetime, timezone

SCHEMA_VERSION = 5


def input_hash(inputs: dict[str, str]) -> str:
    text = f"schema={SCHEMA_VERSION}\n" + "\n".join(f"{k}\t{inputs[k]}" for k in sorted(inputs))
    return hashlib.sha256(text.encode()).hexdigest()


INTERNAL_COLUMNS = ("job_id", "attempt_id", "review_prefix", "rules_sha256", "code_commit", "detector_revision", "run", "scene_id", "hull_id")


def captures(rows: list[dict]) -> set[str]:
    return {row[k] for row in rows for k in ("capture_png", "capture_markers_png") if row.get(k)}


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    seen: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: r.get("_source_mtime") or 0):
        seen[row["finding_id"]] = row
    return sorted(seen.values(), key=lambda r: (r.get("capture_utc") or datetime.min.replace(tzinfo=timezone.utc), r["finding_id"])), len(rows) - len(seen)
