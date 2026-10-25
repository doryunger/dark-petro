import argparse
import fcntl
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from . import build as B
from . import features as F
from . import sync as S
from .config import Config

log = logging.getLogger("sts_tiles")


def s3_client(cfg: Config):
    import boto3
    return boto3.client("s3", region_name=cfg.region)


def run(cfg: Config, force: bool, offline: bool) -> dict:
    s3 = None
    if not offline:
        if not cfg.bucket:
            raise SystemExit("STS_BUCKET is not set")
        s3 = s3_client(cfg)
        S.sync_parquets(s3, cfg.bucket, cfg.findings_prefix, cfg.mirror, cfg.state_file)
    inputs = F.local_inputs(cfg.mirror, cfg.findings_prefix)
    digest = F.input_hash(inputs)
    live = B.current_manifest(cfg)
    if not force and live and live.get("input_hash") == digest:
        refreshed = 0
        if s3:
            on_disk = {path.relative_to(cfg.mirror).as_posix() for path in (cfg.mirror / "captures").rglob("*.png")}
            _, refreshed = S.sync_captures(s3, cfg.bucket, on_disk, cfg.mirror, cfg.captures_state_file)
        return {"result": "up_to_date", "build_id": live["build_id"], "inputs": len(inputs), "captures_refreshed": refreshed}
    rows, dups = F.dedupe(B.read_rows(cfg.mirror, sorted(inputs)))
    total = len(rows)
    rows = F.visible(rows)
    if not rows:
        return {"result": "skipped_empty", "inputs": len(inputs), "build_id": live and live["build_id"]}
    if dups:
        log.warning("%d duplicate finding_id rows dropped", dups)
    wanted = F.captures(rows)
    missing = S.sync_captures(s3, cfg.bucket, wanted, cfg.mirror, cfg.captures_state_file)[0] if s3 else sorted(k for k in wanted if not (cfg.mirror / k).exists())
    if missing:
        log.warning("%d captures referenced but not on S3, e.g. %s", len(missing), missing[0])
    out = B.build(cfg, inputs, rows, missing)
    S.prune_captures(cfg.mirror, wanted)
    B.prune_builds(cfg)
    return {"result": "built", "build_id": out.name, "inputs": len(inputs), "findings": len(rows), "hidden_rejected": total - len(rows), "missing_captures": len(missing)}


def run_once(cfg: Config, force: bool, offline: bool, trigger: str) -> dict:
    with open(cfg.data_dir / ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        started = time.monotonic()
        status = {"started_utc": datetime.now(timezone.utc).isoformat(), "trigger": trigger}
        try:
            status |= run(cfg, force, offline)
        except Exception as e:
            log.exception("run failed")
            status |= {"result": "failed", "error": f"{type(e).__name__}: {e}"[:500]}
        status["seconds"] = round(time.monotonic() - started, 2)
        S.write_atomic(cfg.status_file, json.dumps(status, indent=1).encode())
        log.info("%s", json.dumps(status))
        return status


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", stream=sys.stdout)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser(prog="sts_tiles")
    parser.add_argument("command", choices=("run", "build", "listen", "watch", "serve"), nargs="?", default="run")
    parser.add_argument("--force", action="store_true", help="rebuild even when the inputs are unchanged")
    args = parser.parse_args()
    cfg = Config.from_env()
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    if args.command == "serve":
        from .serve import serve
        return serve(cfg)
    if args.command == "watch":
        from .watch import watch
        return watch(cfg, lambda: run_once(cfg, False, True, "watch"))
    if args.command == "listen":
        from .listen import listen
        queue_url = os.environ.get("STS_QUEUE_URL")
        if not queue_url:
            raise SystemExit("STS_QUEUE_URL is not set")
        return listen(cfg, lambda force, offline: run_once(cfg, force, offline, "sqs"), queue_url)
    status = run_once(cfg, args.force, offline=args.command == "build", trigger="timer" if args.command == "run" else "manual")
    return 1 if status["result"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
