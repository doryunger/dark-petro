import { useCallback, useEffect, useState, type RefObject } from "react";

export interface Gap {
  index: number;
  height: number;
}

function adjust(y: number, rowHeight: number, gap?: Gap): number {
  if (!gap) return y;
  const top = (gap.index + 1) * rowHeight;
  if (y < top) return y;
  if (y < top + gap.height) return top - 1;
  return y - gap.height;
}

export function visibleRange(scrollTop: number, height: number, count: number, rowHeight: number, overscan = 4, gap?: Gap) {
  const start = Math.max(0, Math.floor(adjust(scrollTop, rowHeight, gap) / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil(adjust(scrollTop + height, rowHeight, gap) / rowHeight) + overscan);
  return { start, end };
}

export function rowOffset(index: number, rowHeight: number, gap?: Gap): number {
  return index * rowHeight + (gap && index > gap.index ? gap.height : 0);
}

export function revealScrollTop(index: number, count: number, rowHeight: number, viewHeight: number, gap?: Gap): number {
  const max = Math.max(0, count * rowHeight + (gap?.height ?? 0) - viewHeight);
  return Math.min(Math.max(0, rowOffset(Math.max(0, index), rowHeight, gap)), max);
}

export function useVirtualRows(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, gap?: Gap) {
  const [range, setRange] = useState({ start: 0, end: 20 });
  const gapIndex = gap?.index;
  const gapHeight = gap?.height;
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const spacer = gapIndex === undefined || gapHeight === undefined ? undefined : { index: gapIndex, height: gapHeight };
    const next = visibleRange(el.scrollTop, el.clientHeight, count, rowHeight, 4, spacer);
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref, count, rowHeight, gapIndex, gapHeight]);
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
