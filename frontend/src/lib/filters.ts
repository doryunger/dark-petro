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

export function activityTileUrl(origin: string, filter: Filter, id: string): string {
  return `${origin}/tiles/activity/{z}/{x}/{y}.mvt?from=${filter.from}&to=${filter.to}&id=${encodeURIComponent(id)}`;
}

export function tileUrl(origin: string, filter: Filter, tab: Tab = "pairs"): string {
  const params = [filterParams(filter)];
  const path = tab === "pairs" ? "tiles" : `tiles/${tab}`;
  return `${origin}/${path}/{z}/{x}/{y}.mvt?${params.join("&")}`;
}

export function matches(entry: Pick<Entry, "date" | "source">, filter: Filter): boolean {
  return entry.date >= filter.from && entry.date <= filter.to && filter.sources.includes(entry.source);
}
