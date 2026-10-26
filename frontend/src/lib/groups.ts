import { HISTORY_PAD_REM, HISTORY_REM, HISTORY_ROW_REM } from "./constants";
import { shortId } from "./entries";
import type { Entry, TrackPoint } from "./types";

export function imoOf(entry: Pick<Entry, "tab" | "vessels">): string | null {
  return entry.tab === "sanctioned" ? (entry.vessels[0]?.imo ?? null) : null;
}

export function trackEntry(point: TrackPoint): Entry {
  return {
    id: point.id,
    tab: "sanctioned",
    shortId: shortId(point.id),
    date: point.date,
    t: point.t,
    hotSpot: point.hot_spot,
    source: point.source,
    sanctioned: true,
    image: point.image,
    lon: point.lon,
    lat: point.lat,
    vessels: [{ name: point.name, flag: point.flag, imo: point.imo, sanctioned: true, known: point.name != null }],
  };
}

export function historyOf(points: TrackPoint[], headId: string): Entry[] {
  return points
    .filter((p) => p.id !== headId)
    .map(trackEntry)
    .sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function historyHeight(rows: number): number {
  return Math.min(HISTORY_REM, rows * HISTORY_ROW_REM + HISTORY_PAD_REM);
}
