import { describe, expect, it } from "vitest";
import { featureBounds, shouldFly, topCenter } from "./geo";
import type { HotSpotCollection, HotSpotFeature } from "./types";

const box = (name: string, west: number, south: number, east: number, north: number): HotSpotFeature => ({
  type: "Feature",
  properties: { name, label: name },
  geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
});

const areas: HotSpotCollection = {
  type: "FeatureCollection",
  features: [box("off_sohar", 56.6, 24.2, 57.6, 24.9), box("sikka_vadinar", 69.3, 22.35, 70, 22.68), box("johor_east_scs", 103.5, 1.8, 106, 2.8)],
};

describe("geo", () => {
  it("flies only up to zoom 10, fractional zoom included", () => {
    expect(shouldFly(4)).toBe(true);
    expect(shouldFly(10)).toBe(true);
    expect(shouldFly(10.01)).toBe(false);
    expect(shouldFly(11)).toBe(false);
    expect(shouldFly(12)).toBe(false);
    expect(shouldFly(13)).toBe(false);
  });

  it("fits every area it is given, whatever their number", () => {
    expect(featureBounds(areas)).toEqual([[56.6, 1.8], [106, 24.9]]);
    expect(featureBounds({ type: "FeatureCollection", features: [box("one", 1, 2, 3, 4)] })).toEqual([[1, 2], [3, 4]]);
  });

  it("has no bounds when there are no areas", () => {
    expect(featureBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });

  it("puts a label at the top centre of an area", () => {
    const [lon, lat] = topCenter(areas.features[0]);
    expect(lon).toBeCloseTo(57.1, 6);
    expect(lat).toBe(24.9);
  });
});
