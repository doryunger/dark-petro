import type { Entry, Filter, Tab } from "./types";

function filterParams(filter: Filter): string {
  return [`from=${filter.from}`, `to=${filter.to}`, `source=${[...filter.sources].sort().join(",")}`].join("&");
}

export function trackUrl(imo: string, filter: Filter): string {
  return `/tracks/${encodeURIComponent(imo)}?${filterParams(filter)}`;
}

export function activityUrl(imo: string, filter: Filter): string {
  return `/activities/${encodeURIComponent(imo)}?from=${filter.from}&to=${filter.to}`;
}

export function activityImosUrl(filter: Pick<Filter, "from" | "to">): string {
  return `/activity-imos?from=${filter.from}&to=${filter.to}`;
}

export function activityTileUrl(origin: string, id: string): string {
  return `${origin}/tiles/activity/{z}/{x}/{y}.mvt?id=${encodeURIComponent(id)}`;
}

export function tileUrl(origin: string, tab: Tab, filter: Filter): string {
  const path = tab === "pairs" ? "tiles" : `tiles/${tab}`;
  return `${origin}/${path}/{z}/{x}/{y}.mvt?${filterParams(filter)}`;
}

export function matches(entry: Pick<Entry, "date" | "source">, filter: Filter): boolean {
  return entry.date >= filter.from && entry.date <= filter.to && filter.sources.includes(entry.source);
}
