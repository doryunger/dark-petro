import { describe, expect, it } from "vitest";
import { PAIR_IMAGES, pairSvg } from "./icons.js";

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

  it("has three images: yellow and red with a black outline, cyan with a white one", () => {
    expect(PAIR_IMAGES.pair).toEqual({ fill: "#f2c230", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-sanctioned"]).toEqual({ fill: "#d64545", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-selected"]).toEqual({ fill: "#4fd0e4", stroke: "#ffffff" });
  });
});
