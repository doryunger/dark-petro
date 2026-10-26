import type { HistoryCollection, LngLat, TrackLine, TrackPoint } from "./types";

export function trackLine(points: Pick<TrackPoint, "id" | "t" | "lon" | "lat">[]): TrackLine {
  if (points.length < 2) return { type: "FeatureCollection", features: [] };
  const ordered = [...points].sort((a, b) => b.t - a.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const coordinates = ordered.map((p): LngLat => [p.lon, p.lat]);
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] };
}

export function historyPoints(points: TrackPoint[]): HistoryCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({ type: "Feature", properties: { id: p.id, ...(p.yaw == null ? {} : { yaw: p.yaw }) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
  };
}
