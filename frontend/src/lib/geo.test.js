import { describe, expect, it } from "vitest";
import hotSpots from "../data/hot_spots.json";
import { featureBounds, topCenter } from "./geo.js";

describe("geo", () => {
  it("covers the four hot spots", () => {
    expect(hotSpots.features.map((f) => f.properties.name).sort()).toEqual(["fujairah_outer", "johor_east_scs", "malaysia_eopl", "off_sohar"]);
    expect(featureBounds(hotSpots)).toEqual([[56.3, 0.8], [106, 25.8]]);
  });

  it("puts a label at the top centre of an area", () => {
    const sohar = hotSpots.features.find((f) => f.properties.name === "off_sohar");
    const [lon, lat] = topCenter(sohar);
    expect(lon).toBeCloseTo(57.1, 6);
    expect(lat).toBe(24.9);
  });
});
