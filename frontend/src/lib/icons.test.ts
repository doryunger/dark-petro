import { describe, expect, it } from "vitest";
import { PAIR_IMAGES, VESSEL_IMAGES, pairSvg, vesselSvg } from "./icons";

describe("icons", () => {
  it("draws two hulls with the given fill and outline, turned to point south", () => {
    const svg = pairSvg({ fill: "#f2c230", stroke: "#000000" });
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('fill="#f2c230"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('transform="rotate(180 28 64)"');
  });

  it("takes the size and the orientation as parameters", () => {
    const svg = pairSvg({ fill: "#fff", stroke: "#000", orientation: 0, width: 78, height: 168 });
    expect(svg).toContain('width="78"');
    expect(svg).toContain('height="168"');
    expect(svg).toContain('rotate(0 28 64)');
  });

  it("draws one hull for a single vessel, with the fill and outline given and the bow up", () => {
    const svg = vesselSvg({ fill: "#d64545", stroke: "#000000" });
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#d64545"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('rotate(0 12 64)');
    expect(vesselSvg({ fill: "#fff", stroke: "#000", orientation: 90, width: 39, height: 168 })).toContain('width="39"');
  });

  it("has two single-vessel images: red with a black outline, cyan with a white one", () => {
    expect(VESSEL_IMAGES).toEqual({ "vessel-sanctioned": { fill: "#d64545", stroke: "#000000" }, "vessel-selected": { fill: "#4fd0e4", stroke: "#ffffff" } });
  });

  it("has three images: yellow and red with a black outline, cyan with a white one", () => {
    expect(PAIR_IMAGES.pair).toEqual({ fill: "#f2c230", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-sanctioned"]).toEqual({ fill: "#d64545", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-selected"]).toEqual({ fill: "#4fd0e4", stroke: "#ffffff" });
  });
});
