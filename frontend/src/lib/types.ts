export type Order = "latest" | "oldest";
export type Tab = "pairs" | "sanctioned";

export interface Meta {
  min_date: string;
  max_date: string;
  sources: string[];
}

export interface Filter {
  from: string;
  to: string;
  sources: string[];
}

export interface Vessel {
  name: string | null;
  flag: string | null;
  imo: string | null;
  sanctioned: boolean;
  known: boolean;
}

export interface Entry {
  id: string;
  tab: Tab;
  shortId: string;
  date: string;
  t: number;
  hotSpot: string;
  source: string;
  sanctioned: boolean;
  image: string | null;
  lon: number;
  lat: number;
  vessels: Vessel[];
  detections?: number;
  hasRelatedActivity?: boolean;
}

export interface TrackPoint {
  id: string;
  date: string;
  t: number;
  hot_spot: string;
  source: string;
  image: string | null;
  yaw: number | null;
  lon: number;
  lat: number;
  name: string | null;
  flag: string | null;
  imo: string | null;
}

export interface ActivityMatch {
  entry: Entry;
}

export interface ActivityRecord {
  id: string;
  date: string;
  t: number;
  hot_spot: string;
  source: string;
  image: string | null;
  lon: number;
  lat: number;
  sanctioned: boolean;
  v1_name: string | null;
  v1_flag: string | null;
  v1_imo: string | null;
  v1_sanctioned: boolean;
  v2_name: string | null;
  v2_flag: string | null;
  v2_imo: string | null;
  v2_sanctioned: boolean;
}

export interface TrackLine {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: Record<string, never>; geometry: { type: "LineString"; coordinates: LngLat[] } }[];
}

export interface HistoryCollection {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { id: string; yaw?: number }; geometry: { type: "Point"; coordinates: LngLat } }[];
}

export interface TileProperties {
  id: string;
  date: string;
  t: number;
  hot_spot: string;
  source: string;
  sanctioned?: boolean;
  image?: string;
  lon?: number;
  lat?: number;
  yaw?: number;
  [vessel: string]: string | number | boolean | undefined;
}

export interface TileFeature {
  properties: TileProperties;
  geometry: { coordinates: number[] };
}

export interface HotSpotFeature {
  properties: { name: string; label: string };
  geometry: { coordinates: number[][][] };
}

export interface HotSpotCollection {
  features: HotSpotFeature[];
}

export type LngLat = [number, number];
export type Bounds = [LngLat, LngLat];
