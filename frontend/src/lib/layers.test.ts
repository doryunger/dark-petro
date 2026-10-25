import { describe, expect, it } from "vitest";
import { HOT_SPOT_LINE, ICON_SIZE, iconImage, pairsLayer, sortKey } from "./layers";

describe("layers", () => {
  it("picks the cyan image for the selected pair, then red for sanctioned, then yellow", () => {
    expect(iconImage("x")).toEqual(["case", ["==", ["get", "id"], "x"], "pair-selected", ["==", ["get", "sanctioned"], true], "pair-sanctioned", "pair"]);
    expect(iconImage(null)[1][2]).toBe("");
  });

  it("draws the first entry of the reel on top: a higher key is drawn later, and the selected pair last", () => {
    expect(sortKey("latest", "x")[3]).toEqual(["*", 1, ["get", "t"]]);
    expect(sortKey("oldest", "x")[3]).toEqual(["*", -1, ["get", "t"]]);
    expect(sortKey("latest", "x")[2]).toBeGreaterThan(1e12);
  });

  it("shows every icon, rotated by the yaw measured from the north", () => {
    const { layout = {}, source, "source-layer": sourceLayer } = pairsLayer({ order: "latest", selectedId: null });
    expect(layout["icon-allow-overlap"]).toBe(true);
    expect(layout["icon-ignore-placement"]).toBe(true);
    expect(layout["icon-rotation-alignment"]).toBe("map");
    expect(layout["icon-rotate"]).toEqual(["coalesce", ["get", "yaw"], 0]);
    expect([source, sourceLayer]).toEqual(["pairs", "pairs"]);
  });

  it("keeps the icons small at low zoom and close to full size when zoomed in", () => {
    const stops = ICON_SIZE.slice(3);
    const sizes = stops.filter((_, i) => i % 2 === 1);
    expect(sizes).toEqual([0.3, 0.5, 0.8, 1]);
    expect(HOT_SPOT_LINE.type).toBe("line");
  });
});
