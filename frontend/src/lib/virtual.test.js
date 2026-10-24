import { describe, expect, it } from "vitest";
import { visibleRange } from "./virtual.js";

describe("virtual list", () => {
  it("renders the rows in view plus a few around them", () => {
    expect(visibleRange(0, 700, 1000, 70, 4)).toEqual({ start: 0, end: 14 });
    expect(visibleRange(7000, 700, 1000, 70, 4)).toEqual({ start: 96, end: 114 });
  });

  it("never goes past the list", () => {
    expect(visibleRange(0, 700, 3, 70, 4)).toEqual({ start: 0, end: 3 });
    expect(visibleRange(69000, 700, 1000, 70, 4)).toEqual({ start: 981, end: 1000 });
  });
});
