import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from . import features as F

log = logging.getLogger(__name__)


def read_table(mirror: Path, keys: list[str]):
    files = [str(mirror / k) for k in keys]
    con = duckdb.connect()
    con.execute("SET TimeZone = 'UTC'")
    return con.execute("SELECT * EXCLUDE (geometry) FROM read_parquet(?, union_by_name = true, filename = true)", [files]).to_arrow_table()


def read_rows(mirror: Path, keys: list[str]) -> list[dict]:
    if not keys:
        return []
    rows = read_table(mirror, keys).to_pylist()
    mtimes = {}
    for row in rows:
        f = row.pop("filename")
        if f not in mtimes:
            mtimes[f] = os.path.getmtime(f)
        row["_source_mtime"] = mtimes[f]
        row["source_key"] = Path(f).relative_to(mirror).as_posix()
    return rows


TABLE_TYPES = {
    "finding_id": pa.string(),
    "lat": pa.float64(),
    "lon": pa.float64(),
    "capture_utc": pa.timestamp("us", tz="UTC"),
    "hot_spot": pa.string(),
    "source": pa.string(),
    "capture_png": pa.string(),
    "yaw": pa.float64(),
    **{f"vessel_{n}_{k}": t for n in (1, 2) for k, t in (("name", pa.string()), ("flag", pa.string()), ("imo", pa.string()), ("is_sanctioned", pa.bool_()))},
}


def write_table(rows: list[dict], target: Path) -> None:
    clean = [{k: r.get(k) for k in TABLE_TYPES if k != "yaw"} | {"yaw": F.rotation(r)} for r in rows]
    table = pa.Table.from_pylist(clean)
    for name, kind in TABLE_TYPES.items():
        if name not in table.column_names:
            table = table.append_column(name, pa.nulls(table.num_rows, kind))
        elif table.schema.field(name).type != kind:
            table = table.set_column(table.column_names.index(name), name, table.column(name).cast(kind))
    pq.write_table(table, target)


def summary(rows: list[dict]) -> dict:
    by = lambda key: dict(sorted(((v, sum(1 for r in rows if r.get(key) == v)) for v in {r.get(key) for r in rows}), key=lambda kv: str(kv[0])))
    times = [r["capture_utc"] for r in rows if r.get("capture_utc")]
    lons, lats = [r["lon"] for r in rows], [r["lat"] for r in rows]
    return {
        "findings": len(rows),
        "by_hot_spot": by("hot_spot"),
        "by_source": by("source"),
        "by_qa_status": by("qa_status"),
        "by_verdict": by("verdict"),
        "time_range": [min(times).isoformat(), max(times).isoformat()] if times else None,
        "bounds": [min(lons), min(lats), max(lons), max(lats)] if rows else None,
    }


def build(cfg, inputs: dict[str, str], rows: list[dict], missing_captures: list[str]) -> Path:
    digest = F.input_hash(inputs)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = f"{stamp}-{digest[:12]}"
    cfg.builds.mkdir(parents=True, exist_ok=True)
    work = cfg.builds / f".{name}.tmp"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    try:
        write_table(rows, work / "findings.parquet")
        manifest = {
            "build_id": name,
            "built_utc": datetime.now(timezone.utc).isoformat(),
            "input_hash": digest,
            "inputs": [{"key": k, "sha256": inputs[k]} for k in sorted(inputs)],
            "missing_captures": missing_captures,
            "files": {"table": "findings.parquet", "capture_root": "mirror/"},
            **summary(rows),
        }
        (work / "manifest.json").write_text(json.dumps(manifest, indent=1, default=str))
        final = cfg.builds / name
        os.replace(work, final)
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise
    publish(cfg, final)
    return final


def publish(cfg, build_dir: Path) -> None:
    link = cfg.data_dir / ".current.tmp"
    link.unlink(missing_ok=True)
    link.symlink_to(build_dir.relative_to(cfg.data_dir))
    os.replace(link, cfg.current)
    log.info("published %s", build_dir.name)


def current_manifest(cfg) -> dict | None:
    try:
        return json.loads((cfg.current / "manifest.json").read_text())
    except (FileNotFoundError, ValueError):
        return None


def prune_builds(cfg) -> None:
    live = cfg.current.resolve().name if cfg.current.exists() else None
    builds = sorted(p for p in cfg.builds.iterdir() if p.is_dir() and not p.name.startswith("."))
    for old in builds[:-cfg.keep_builds]:
        if old.name != live:
            shutil.rmtree(old)
            log.info("pruned build %s", old.name)
