import json
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)


def load_state(path: Path) -> dict[str, str]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {}


def write_atomic(path: Path, data: bytes, mtime: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(data)
    if mtime is not None:
        os.utime(tmp, (mtime, mtime))
    os.replace(tmp, path)


def list_parquets(s3, bucket: str, prefixes: tuple[str, ...]) -> dict[str, str]:
    keys = {}
    for prefix in prefixes:
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                if obj["Key"].endswith(".parquet"):
                    keys[obj["Key"]] = obj["ETag"].strip('"')
    return keys


def sync_parquets(s3, bucket: str, prefixes: tuple[str, ...], mirror: Path, state_file: Path) -> dict[str, str]:
    remote = list_parquets(s3, bucket, prefixes)
    state = load_state(state_file)
    for key, etag in sorted(remote.items()):
        path = mirror / key
        if state.get(key) == etag and path.exists():
            continue
        obj = s3.get_object(Bucket=bucket, Key=key)
        state[key] = obj["ETag"].strip('"')
        write_atomic(path, obj["Body"].read(), obj["LastModified"].timestamp())
        log.info("fetched %s etag=%s", key, state[key])
    for key in sorted(set(state) - set(remote)):
        (mirror / key).unlink(missing_ok=True)
        del state[key]
        log.info("removed %s (gone from S3)", key)
    write_atomic(state_file, json.dumps(state, indent=1, sort_keys=True).encode())
    return state


def list_etags(s3, bucket: str, prefix: str) -> dict[str, str]:
    etags = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            etags[obj["Key"]] = obj["ETag"].strip('"')
    return etags


def sync_captures(s3, bucket: str, keys: set[str], mirror: Path, state_file: Path, prefix: str = "captures/") -> tuple[list[str], int]:
    remote = list_etags(s3, bucket, prefix)
    state = load_state(state_file)
    missing, fetched = [], 0
    for key in sorted(keys):
        path = mirror / key
        if key not in remote:
            missing.append(key)
            continue
        if state.get(key) == remote[key] and path.exists():
            continue
        obj = s3.get_object(Bucket=bucket, Key=key)
        state[key] = obj["ETag"].strip('"')
        write_atomic(path, obj["Body"].read(), obj["LastModified"].timestamp())
        fetched += 1
        log.info("fetched %s", key)
    write_atomic(state_file, json.dumps({k: v for k, v in state.items() if k in keys}, indent=1, sort_keys=True).encode())
    return missing, fetched


def prune_captures(mirror: Path, keep: set[str], prefix: str = "captures/") -> int:
    root = mirror / prefix
    removed = 0
    if not root.exists():
        return 0
    for path in root.rglob("*"):
        if path.is_file() and path.relative_to(mirror).as_posix() not in keep:
            path.unlink()
            removed += 1
    return removed
