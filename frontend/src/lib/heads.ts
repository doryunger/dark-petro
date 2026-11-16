import { dayIndex } from "./dates";
import type { Filter, SanctionedDetection } from "./types";

const DAY_S = 86400;

export interface Heads {
  ids: string[];
  counts: Record<string, number>;
}

export const NO_HEADS: Heads = { ids: [], counts: {} };

export function rangeSeconds(filter: Pick<Filter, "from" | "to">): [number, number] {
  return [dayIndex(filter.from) * DAY_S, (dayIndex(filter.to) + 1) * DAY_S];
}

export function latestPerVessel(detections: SanctionedDetection[], filter: Filter): Heads {
  const [start, end] = rangeSeconds(filter);
  const best = new Map<string, SanctionedDetection>();
  const total = new Map<string, number>();
  for (const d of detections) {
    if (d.t < start || d.t >= end || !filter.sources.includes(d.source)) continue;
    const key = d.imo ?? d.id;
    total.set(key, (total.get(key) ?? 0) + 1);
    const head = best.get(key);
    if (!head || d.t > head.t || (d.t === head.t && d.id < head.id)) best.set(key, d);
  }
  const counts: Record<string, number> = {};
  for (const [key, head] of best) counts[head.id] = total.get(key) ?? 1;
  return { ids: Object.keys(counts), counts };
}
