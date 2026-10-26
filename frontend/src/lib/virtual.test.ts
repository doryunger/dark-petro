import { describe, expect, it } from "vitest";
import { revealScrollTop, rowOffset, visibleRange } from "./virtual";

describe("virtual list", () => {
  it("renders the rows in view plus a few around them", () => {
    expect(visibleRange(0, 700, 1000, 70, 4)).toEqual({ start: 0, end: 14 });
    expect(visibleRange(7000, 700, 1000, 70, 4)).toEqual({ start: 96, end: 114 });
  });

  it("never goes past the list", () => {
    expect(visibleRange(0, 700, 3, 70, 4)).toEqual({ start: 0, end: 3 });
    expect(visibleRange(69000, 700, 1000, 70, 4)).toEqual({ start: 981, end: 1000 });
  });

  it("makes room for an open row: the rows after it start lower, the rows before it do not move", () => {
    const gap = { index: 2, height: 100 };
    expect(rowOffset(2, 70, gap)).toBe(140);
    expect(rowOffset(3, 70, gap)).toBe(310);
    expect(rowOffset(1, 70, gap)).toBe(70);
    expect(rowOffset(3, 70)).toBe(210);
  });

  it("renders the open row while any part of it, or of its box, is in view", () => {
    const gap = { index: 2, height: 100 };
    expect(visibleRange(0, 700, 1000, 70, 0, gap)).toEqual({ start: 0, end: 9 });
    expect(visibleRange(250, 100, 1000, 70, 0, gap)).toEqual({ start: 2, end: 4 });
    expect(visibleRange(250, 50, 1000, 70, 0, gap)).toEqual({ start: 2, end: 3 });
    expect(visibleRange(310, 140, 1000, 70, 0, gap)).toEqual({ start: 3, end: 5 });
    expect(visibleRange(0, 700, 3, 70, 4, gap)).toEqual({ start: 0, end: 3 });
  });

  it("scrolls to a row below an open row by its lower offset and keeps the end of the list reachable", () => {
    const gap = { index: 2, height: 100 };
    expect(revealScrollTop(5, 100, 70, 700, gap)).toBe(5 * 70 + 100);
    expect(revealScrollTop(1, 100, 70, 700, gap)).toBe(70);
    expect(revealScrollTop(99, 100, 70, 700, gap)).toBe(100 * 70 + 100 - 700);
  });

  it("puts the revealed row at the top and stops at the end of the list", () => {
    expect(revealScrollTop(0, 100, 70, 700)).toBe(0);
    expect(revealScrollTop(10, 100, 70, 700)).toBe(700);
    expect(revealScrollTop(99, 100, 70, 700)).toBe(100 * 70 - 700);
    expect(revealScrollTop(3, 5, 70, 700)).toBe(0);
  });
});
