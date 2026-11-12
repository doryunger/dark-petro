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

  it("has four single-vessel images: red and a lighter red for older detections with a black outline, cyan and grey with a white ring inside a thinner black one", () => {
    const ring = { stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3, scale: 1.4 };
    expect(VESSEL_IMAGES).toEqual({
      "vessel-sanctioned": { fill: "#d64545", stroke: "#000000" },
      "vessel-selected": { fill: "#4fd0e4", ...ring },
      "vessel-picked": { fill: "#9aa5b0", ...ring },
      "vessel-history": { fill: "#e88f8f", stroke: "#000000" },
    });
  });

  it("has three pair images: yellow and red with a black outline, cyan with a white ring inside a thinner black one, and bigger", () => {
    expect(PAIR_IMAGES.pair).toEqual({ fill: "#f2c230", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-sanctioned"]).toEqual({ fill: "#d64545", stroke: "#000000" });
    expect(PAIR_IMAGES["pair-selected"]).toEqual({ fill: "#4fd0e4", stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3, scale: 1.4 });
  });

  it("draws a ring as a black layer under a white layer under the fill, and widens the view box so the ring is not cut", () => {
    const plain = pairSvg({ fill: "#4fd0e4", stroke: "#fff" });
    const ringed = pairSvg({ fill: "#4fd0e4", stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3 });
    expect(plain).toContain('viewBox="-3 -3 62 134"');
    expect(ringed.match(/<path /g)).toHaveLength(6);
    expect(ringed).toContain('viewBox="-10 -10 76 148"');
    expect(ringed.indexOf('stroke="#000000"')).toBeLessThan(ringed.indexOf('stroke="#ffffff"'));
    expect(ringed.indexOf('stroke="#ffffff"')).toBeLessThan(ringed.lastIndexOf('fill="#4fd0e4"'));
    expect(ringed).toContain('stroke-width="18"');
    expect(ringed).toContain('stroke-width="12"');
  });

  it("keeps a black line as wide as the outer one between the two hulls of a pair, by cutting each white ring at the middle", () => {
    const ringed = pairSvg({ fill: "#4fd0e4", stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3 });
    expect(ringed.match(/<clipPath /g)).toHaveLength(2);
    expect(ringed).toContain('width="126.5"');
    expect(ringed).toContain('x="29.5"');
    expect(ringed).toContain('clip-path="url(#hull-first)"');
    expect(ringed).toContain('clip-path="url(#hull-second)"');
    expect(vesselSvg({ fill: "#4fd0e4", stroke: "#ffffff", strokeWidth: 12, outline: "#000000", outlineWidth: 3 })).not.toContain("clipPath");
    expect(pairSvg({ fill: "#f2c230", stroke: "#000000" })).not.toContain("clipPath");
  });
});
