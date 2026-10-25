import { useCallback, useEffect, useState, type RefObject } from "react";

export function visibleRange(scrollTop: number, height: number, count: number, rowHeight: number, overscan = 4) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { start, end };
}

export function revealScrollTop(index: number, count: number, rowHeight: number, viewHeight: number): number {
  const max = Math.max(0, count * rowHeight - viewHeight);
  return Math.min(Math.max(0, index) * rowHeight, max);
}

export function useVirtualRows(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number) {
  const [range, setRange] = useState({ start: 0, end: 20 });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = visibleRange(el.scrollTop, el.clientHeight, count, rowHeight);
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref, count, rowHeight]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
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
