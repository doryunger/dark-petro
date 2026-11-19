import { createEffect, createSignal, onSettled, untrack } from "solid-js";

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

export function createVirtualRows(scroller: () => HTMLElement | undefined, count: () => number, rowHeight: () => number, gap: () => Gap | undefined) {
  const [range, setRange] = createSignal({ start: 0, end: 20 });
  const update = () => {
    const el = scroller();
    if (!el) return;
    const next = visibleRange(el.scrollTop, el.clientHeight, count(), rowHeight(), 4, gap());
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };
  createEffect(() => [count(), rowHeight(), gap()?.index, gap()?.height] as const, () => untrack(update));
  onSettled(() => {
    const el = scroller();
    if (!el) return undefined;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  });
  return range;
}
