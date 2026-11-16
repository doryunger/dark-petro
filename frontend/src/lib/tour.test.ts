import { describe, expect, it } from "vitest";
import { minSide, padRect, placeCard, rectOfPoints, type Rect } from "./tour";

const screen: Rect = { left: 0, top: 0, right: 1200, bottom: 800 };
const card = { width: 320, height: 200 };
const hits = (a: Rect, b: Rect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

describe("tour", () => {
  it("wraps projected points in a rectangle", () => {
    expect(rectOfPoints([{ x: 5, y: 9 }, { x: 1, y: 3 }, { x: 4, y: 7 }])).toEqual({ left: 1, top: 3, right: 5, bottom: 9 });
    expect(rectOfPoints([])).toBeNull();
  });

  it("pads a rectangle but keeps it on screen", () => {
    expect(padRect({ left: 0, top: 10, right: 1195, bottom: 100 }, 8, { width: 1200, height: 800 })).toEqual({ left: 2, top: 2, right: 1198, bottom: 108 });
  });

  it("grows a tiny rectangle to a minimum side around its centre", () => {
    expect(minSide({ left: 100, top: 100, right: 104, bottom: 104 }, 20)).toEqual({ left: 92, top: 92, right: 112, bottom: 112 });
    expect(minSide({ left: 0, top: 0, right: 50, bottom: 50 }, 20)).toEqual({ left: 0, top: 0, right: 50, bottom: 50 });
  });

  it("places the card clear of every target", () => {
    const targets: Rect[] = [
      { left: 100, top: 100, right: 220, bottom: 180 },
      { left: 600, top: 300, right: 700, bottom: 380 },
      { left: 900, top: 500, right: 1000, bottom: 560 },
    ];
    const at = placeCard(targets, card, screen);
    const box = { left: at.x, top: at.y, right: at.x + card.width, bottom: at.y + card.height };
    expect(targets.some((t) => hits(box, t))).toBe(false);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(screen.right);
    expect(box.bottom).toBeLessThanOrEqual(screen.bottom);
  });

  it("stays beside a single target", () => {
    const target: Rect = { left: 40, top: 200, right: 300, bottom: 600 };
    const at = placeCard([target], card, screen);
    expect(hits({ left: at.x, top: at.y, right: at.x + card.width, bottom: at.y + card.height }, target)).toBe(false);
    expect(at.x).toBeLessThan(700);
  });

  it("centres the card when there is no target", () => {
    expect(placeCard([], card, screen)).toEqual({ x: 440, y: 300 });
  });
});
