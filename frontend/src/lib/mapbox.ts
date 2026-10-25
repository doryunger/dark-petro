import type { StyleSpecification } from "mapbox-gl";

const DEFAULT_STYLE = "mapbox/navigation-night-v1";

export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#1d4e6b" } }],
};

export function stylePath(style: string | undefined): string {
  const path = (style ?? "").trim().replace(/^mapbox:\/\/styles\//, "").replace(/^\/+|\/+$/g, "");
  return path || DEFAULT_STYLE;
}

export function styleFor(token: string | undefined, style?: string): string | StyleSpecification {
  return token ? `mapbox://styles/${stylePath(style)}` : FALLBACK_STYLE;
}
