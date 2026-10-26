import type { Tab } from "./types";

export const QUERY_ZOOM = 13;
export const FLY_ZOOM = 12;
export const FLY_UP_TO_ZOOM = 11;
export const MAX_TILE_ZOOM = 14;
export const START_MAX_ZOOM = 4;
export const ROW_HEIGHT_REM = 4.375;
export const ROW_TOP_REM = 0.5;
export const REVEAL_MS = 4000;
export const SOURCE_NAMES: Record<string, string> = { s1: "Sentinel-1", s2: "Sentinel-2" };
export const TOAST_MS = 6000;
export const WEEK_DAYS = 7;
export const TAB_LABELS: Record<Tab, string> = { pairs: "Suspicious activity", sanctioned: "Sanctioned vessels" };
export const TABS: Tab[] = ["pairs", "sanctioned"];
