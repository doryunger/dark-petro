export const ICON_SIZE = ["interpolate", ["linear"], ["zoom"], 4, 0.3, 10, 0.5, 14, 0.8, 16, 1];

export function iconImage(selectedId) {
  return ["case", ["==", ["get", "id"], selectedId ?? ""], "pair-selected", ["==", ["get", "sanctioned"], true], "pair-sanctioned", "pair"];
}

export function sortKey(order, selectedId) {
  const sign = order === "oldest" ? -1 : 1;
  return ["case", ["==", ["get", "id"], selectedId ?? ""], 1e13, ["*", sign, ["get", "t"]]];
}

export function pairsLayer({ order, selectedId }) {
  return {
    id: "pairs",
    type: "symbol",
    source: "pairs",
    "source-layer": "pairs",
    layout: {
      "icon-image": iconImage(selectedId),
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

export const HOT_SPOT_LINE = {
  id: "hot-spots",
  type: "line",
  source: "hot-spots",
  paint: { "line-color": "#e6edf3", "line-width": 1.5, "line-opacity": 0.85 },
};
