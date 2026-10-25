import type { Entry, Filter } from "./types";

export function tileUrl(origin: string, filter: Filter): string {
  const params = [`from=${filter.from}`, `to=${filter.to}`, `source=${[...filter.sources].sort().join(",")}`];
  return `${origin}/tiles/{z}/{x}/{y}.mvt?${params.join("&")}`;
}

export function matches(entry: Pick<Entry, "date" | "source">, filter: Filter): boolean {
  return entry.date >= filter.from && entry.date <= filter.to && filter.sources.includes(entry.source);
}
