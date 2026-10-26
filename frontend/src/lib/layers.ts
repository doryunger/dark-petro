import type { ExpressionSpecification, LineLayerSpecification, SymbolLayerSpecification } from "mapbox-gl";
import type { Order, Tab } from "./types";

export const ICON_SIZE: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 4, 0.3, 10, 0.5, 14, 0.8, 16, 1];

export function iconImage(selectedId: string | null | undefined, tab: Tab = "pairs"): ExpressionSpecification {
  const selected: ExpressionSpecification = ["==", ["get", "id"], selectedId ?? ""];
  if (tab === "sanctioned") return ["case", selected, "vessel-selected", "vessel-sanctioned"];
  return ["case", selected, "pair-selected", ["==", ["get", "sanctioned"], true], "pair-sanctioned", "pair"];
}

export function sortKey(order: Order, selectedId: string | null | undefined): ExpressionSpecification {
  const sign = order === "oldest" ? -1 : 1;
  return ["case", ["==", ["get", "id"], selectedId ?? ""], 1e13, ["*", sign, ["get", "t"]]];
}

export function historyIconImage(pickedId: string | null | undefined): ExpressionSpecification {
  return ["case", ["==", ["get", "id"], pickedId ?? ""], "vessel-picked", "vessel-history"];
}

export function historySortKey(pickedId: string | null | undefined): ExpressionSpecification {
  return ["case", ["==", ["get", "id"], pickedId ?? ""], 1, 0];
}

export function historyLayer(pickedId: string | null | undefined): SymbolLayerSpecification {
  return {
    id: "history",
    type: "symbol",
    source: "history",
    slot: "top",
    paint: { "icon-emissive-strength": 1 },
    layout: {
      "icon-image": historyIconImage(pickedId),
      "icon-size": ICON_SIZE,
      "icon-rotate": ["coalesce", ["get", "yaw"], 0],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": historySortKey(pickedId),
    },
  };
}

export function symbolLayer(tab: Tab, { order, selectedId, active }: { order: Order; selectedId: string | null | undefined; active: boolean }): SymbolLayerSpecification {
  return {
    id: tab,
    type: "symbol",
    source: tab,
    "source-layer": tab,
    slot: "top",
    paint: { "icon-emissive-strength": 1 },
    layout: {
      visibility: active ? "visible" : "none",
      "icon-image": iconImage(selectedId, tab),
      "icon-size": ICON_SIZE,
      "icon-rotate": ["coalesce", ["get", "yaw"], 0],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": sortKey(order, selectedId),
    },
  };
}

export const TRACK_LINE: LineLayerSpecification = {
  id: "track",
  type: "line",
  source: "track",
  slot: "top",
  layout: { "line-cap": "butt", "line-join": "round" },
  paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.9, "line-dasharray": [2, 2], "line-emissive-strength": 1 },
};

export const HOT_SPOT_LINE: LineLayerSpecification = {
  id: "hot-spots",
  type: "line",
  source: "hot-spots",
  slot: "top",
  paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 1, "line-emissive-strength": 1 },
};
