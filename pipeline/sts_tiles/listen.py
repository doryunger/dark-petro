import json
import logging
import signal
import sys
import time
from urllib.parse import unquote_plus

log = logging.getLogger(__name__)
WAIT_S = 20
SETTLE_S = 10
SETTLE_MAX_S = 60


def parse(body: str, prefix: str) -> tuple[str, list[str]]:
    try:
        msg = json.loads(body)
    except ValueError:
        return "ignore", []
    if msg.get("Event") == "s3:TestEvent":
        return "test", []
    keys = [unquote_plus(r["s3"]["object"]["key"]) for r in msg.get("Records", [])
            if r.get("eventName", "").startswith("ObjectCreated") and "s3" in r]
    keys = [k for k in keys if k.startswith(prefix) and k.endswith(".parquet")]
    return ("publish", keys) if keys else ("ignore", [])


def receive(sqs, url: str, wait: int) -> list[dict]:
    return sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10, WaitTimeSeconds=wait).get("Messages", [])


def delete(sqs, url: str, messages: list[dict]) -> None:
    for i in range(0, len(messages), 10):
        chunk = messages[i:i + 10]
        sqs.delete_message_batch(QueueUrl=url, Entries=[{"Id": str(n), "ReceiptHandle": m["ReceiptHandle"]} for n, m in enumerate(chunk)])


def collect(sqs, url: str, first: list[dict]) -> list[dict]:
    batch, start = list(first), time.monotonic()
    while time.monotonic() - start < SETTLE_MAX_S:
        more = receive(sqs, url, SETTLE_S)
        if not more:
            break
        batch += more
    return batch


def listen(cfg, run_once, queue_url: str) -> int:
    import boto3
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    sqs = boto3.client("sqs", region_name=cfg.region)
    log.info("listening on %s", queue_url)
    failures = 0
    while True:
        try:
            first = receive(sqs, queue_url, WAIT_S)
            if not first:
                continue
            batch = collect(sqs, queue_url, first)
            kinds = {"test": [], "publish": [], "ignore": []}
            keys = []
            for m in batch:
                kind, k = parse(m["Body"], cfg.findings_prefix)
                kinds[kind].append(m)
                keys += k
            delete(sqs, queue_url, kinds["test"] + kinds["ignore"])
            if not kinds["publish"]:
                continue
            log.info("%d publish events: %s", len(kinds["publish"]), ", ".join(sorted(set(keys))))
            status = run_once(force=False, offline=False)
            if status.get("result") == "failed":
                log.warning("run failed; leaving %d messages for redelivery", len(kinds["publish"]))
                continue
            delete(sqs, queue_url, kinds["publish"])
            failures = 0
        except Exception:
            failures += 1
            log.exception("listener error (%d in a row)", failures)
            time.sleep(min(300, 5 * 2 ** min(failures, 6)))
