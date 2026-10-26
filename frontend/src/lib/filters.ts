import type { Entry, Filter, Tab } from "./types";

export function tileUrl(origin: string, filter: Filter, tab: Tab = "pairs"): string {
  const params = [`from=${filter.from}`, `to=${filter.to}`, `source=${[...filter.sources].sort().join(",")}`];
  const path = tab === "pairs" ? "tiles" : `tiles/${tab}`;
  return `${origin}/${path}/{z}/{x}/{y}.mvt?${params.join("&")}`;
}

export function matches(entry: Pick<Entry, "date" | "source">, filter: Filter): boolean {
  return entry.date >= filter.from && entry.date <= filter.to && filter.sources.includes(entry.source);
}
