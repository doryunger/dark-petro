import hotSpots from "../data/hot_spots.json";
import { SOURCE_NAMES } from "./constants";
import type { Entry, Order, TileFeature, Vessel } from "./types";

const LABELS = Object.fromEntries(hotSpots.features.map((f) => [f.properties.name, f.properties.label])) as Record<string, string>;

export function shortId(id: string): string {
  return id.split("_").slice(2).join("_").replace(/^w\d+-/, "");
}

export function sourceName(code: string): string {
  return SOURCE_NAMES[code] ?? code;
}

export function hotSpotLabel(name: string | null | undefined): string {
  return name ? (LABELS[name] ?? name) : "";
}

function vessel(p: TileFeature["properties"], n: 1 | 2): Vessel {
  return {
    name: (p[`v${n}_name`] as string | undefined) ?? null,
    flag: (p[`v${n}_flag`] as string | undefined) ?? null,
    imo: (p[`v${n}_imo`] as string | undefined) ?? null,
    sanctioned: p[`v${n}_sanctioned`] === true,
    known: p[`v${n}_name`] != null,
  };
}

export function toEntry(feature: TileFeature): Entry {
  const p = feature.properties;
  const [tileLon, tileLat] = feature.geometry.coordinates;
  return {
    id: p.id,
    shortId: shortId(p.id),
    date: p.date,
    t: p.t,
    hotSpot: p.hot_spot,
    source: p.source,
    sanctioned: p.sanctioned === true,
    image: p.image ?? null,
    lon: p.lon ?? tileLon,
    lat: p.lat ?? tileLat,
    vessels: [vessel(p, 1), vessel(p, 2)],
  };
}

export function uniqueEntries(features: TileFeature[]): Entry[] {
  const seen = new Map<string, Entry>();
  for (const feature of features) {
    if (!seen.has(feature.properties.id)) seen.set(feature.properties.id, toEntry(feature));
  }
  return [...seen.values()];
}

export function sortEntries(entries: Entry[], order: Order): Entry[] {
  const sign = order === "oldest" ? 1 : -1;
  return [...entries].sort((a, b) => sign * (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
