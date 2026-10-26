import logging
import signal
import sys
import time

from . import features as F

log = logging.getLogger(__name__)


def watch(cfg, rebuild) -> int:
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    log.info("watching %s", cfg.mirror)
    cfg.mirror.mkdir(parents=True, exist_ok=True)
    rebuild()
    seen = F.mirror_signature(cfg.mirror, *cfg.prefixes)
    while True:
        time.sleep(cfg.watch_s)
        now = F.mirror_signature(cfg.mirror, *cfg.prefixes)
        if now == seen:
            continue
        time.sleep(cfg.watch_s)
        settled = F.mirror_signature(cfg.mirror, *cfg.prefixes)
        if settled != now:
            continue
        seen = settled
        rebuild()
