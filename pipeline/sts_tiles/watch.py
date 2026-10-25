import logging
import signal
import sys
import time

from . import features as F

log = logging.getLogger(__name__)


def watch(cfg, rebuild) -> int:
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    log.info("watching %s", cfg.mirror / cfg.findings_prefix)
    cfg.mirror.mkdir(parents=True, exist_ok=True)
    rebuild()
    seen = F.mirror_signature(cfg.mirror, cfg.findings_prefix)
    while True:
        time.sleep(cfg.watch_s)
        now = F.mirror_signature(cfg.mirror, cfg.findings_prefix)
        if now == seen:
            continue
        time.sleep(cfg.watch_s)
        settled = F.mirror_signature(cfg.mirror, cfg.findings_prefix)
        if settled != now:
            continue
        seen = settled
        rebuild()
