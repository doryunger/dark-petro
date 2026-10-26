import { describe, expect, it } from "vitest";
import { HOT_SPOT_LINE, ICON_SIZE, iconImage, sortKey, symbolLayer } from "./layers";

const pairsLayer = (selectedId: string | null) => symbolLayer("pairs", { order: "latest", selectedId, active: true });

describe("layers", () => {
  it("picks the cyan image for the selected pair, then red for sanctioned, then yellow", () => {
    expect(iconImage("x")).toEqual(["case", ["==", ["get", "id"], "x"], "pair-selected", ["==", ["get", "sanctioned"], true], "pair-sanctioned", "pair"]);
    expect(iconImage(null)[1][2]).toBe("");
  });

  it("picks the cyan single-vessel image for the selected vessel and red for every other one", () => {
    expect(iconImage("x", "sanctioned")).toEqual(["case", ["==", ["get", "id"], "x"], "vessel-selected", "vessel-sanctioned"]);
  });

  it("has one layer and one source per tab, shown only for the active tab", () => {
    const pairs = symbolLayer("pairs", { order: "latest", selectedId: null, active: false });
    const vessels = symbolLayer("sanctioned", { order: "latest", selectedId: "x", active: true });
    expect([pairs.id, pairs.source, pairs["source-layer"], pairs.layout?.visibility]).toEqual(["pairs", "pairs", "pairs", "none"]);
    expect([vessels.id, vessels.source, vessels["source-layer"], vessels.layout?.visibility]).toEqual(["sanctioned", "sanctioned", "sanctioned", "visible"]);
    expect(vessels.layout?.["icon-image"]).toEqual(iconImage("x", "sanctioned"));
  });

  it("draws the first entry of the reel on top: a higher key is drawn later, and the selected pair last", () => {
    expect(sortKey("latest", "x")[3]).toEqual(["*", 1, ["get", "t"]]);
    expect(sortKey("oldest", "x")[3]).toEqual(["*", -1, ["get", "t"]]);
    expect(sortKey("latest", "x")[2]).toBeGreaterThan(1e12);
  });

  it("shows every icon, rotated by the yaw measured from the north", () => {
    const { layout = {}, source, "source-layer": sourceLayer } = pairsLayer(null);
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

  it("draws the hot-spot lines white and both layers on top of the basemap at full brightness", () => {
    expect(HOT_SPOT_LINE.paint).toMatchObject({ "line-color": "#ffffff", "line-opacity": 1, "line-emissive-strength": 1 });
    expect(HOT_SPOT_LINE.slot).toBe("top");
    const layer = pairsLayer(null);
    expect(layer.slot).toBe("top");
    expect(layer.paint?.["icon-emissive-strength"]).toBe(1);
  });
});
