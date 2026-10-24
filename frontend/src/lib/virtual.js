import { useCallback, useEffect, useState } from "react";

export function visibleRange(scrollTop, height, count, rowHeight, overscan = 4) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { start, end };
}

export function useVirtualRows(ref, count, rowHeight) {
  const [range, setRange] = useState({ start: 0, end: 20 });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = visibleRange(el.scrollTop, el.clientHeight, count, rowHeight);
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref, count, rowHeight]);
  useEffect(() => {
    const el = ref.current;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref, update]);
  return range;
}
