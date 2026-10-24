import hotSpots from "../data/hot_spots.json";
import { SOURCE_NAMES } from "./constants.js";

const LABELS = Object.fromEntries(hotSpots.features.map((f) => [f.properties.name, f.properties.label]));

export function shortId(id) {
  return id.split("_").slice(2).join("_");
}

export function sourceName(code) {
  return SOURCE_NAMES[code] ?? code;
}

export function hotSpotLabel(name) {
  return LABELS[name] ?? name ?? "";
}

export function toEntry(feature) {
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
    vessels: [1, 2].map((n) => ({
      name: p[`v${n}_name`] ?? null,
      flag: p[`v${n}_flag`] ?? null,
      imo: p[`v${n}_imo`] ?? null,
      sanctioned: p[`v${n}_sanctioned`] === true,
    })),
  };
}

export function uniqueEntries(features) {
  const seen = new Map();
  for (const feature of features) {
    if (!seen.has(feature.properties.id)) seen.set(feature.properties.id, toEntry(feature));
  }
  return [...seen.values()];
}

export function sortEntries(entries, order) {
  const sign = order === "oldest" ? 1 : -1;
  return [...entries].sort((a, b) => sign * (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
