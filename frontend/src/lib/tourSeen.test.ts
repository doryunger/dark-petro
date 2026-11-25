import { describe, expect, it } from "vitest";
import { markTourSeen, shouldStartTour, tourRequested, tourSeen } from "./tourSeen";

function memory() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("tourSeen", () => {
  it("starts unseen and stays seen once marked", () => {
    const store = memory();
    expect(tourSeen(store)).toBe(false);
    markTourSeen(store);
    expect(tourSeen(store)).toBe(true);
  });

  it("treats a missing or blocked store as unseen and never throws", () => {
    expect(tourSeen(null)).toBe(false);
    expect(tourSeen(broken)).toBe(false);
    expect(() => markTourSeen(null)).not.toThrow();
    expect(() => markTourSeen(broken)).not.toThrow();
  });

  it("reads the tour parameter from the address", () => {
    expect(tourRequested("?tour=1")).toBe(true);
    expect(tourRequested("?a=2&tour=1")).toBe(true);
    expect(tourRequested("?tour=0")).toBe(false);
    expect(tourRequested("")).toBe(false);
  });

  it("starts for a new visitor, not for a returning one, unless asked", () => {
    const store = memory();
    expect(shouldStartTour("", store)).toBe(true);
    markTourSeen(store);
    expect(shouldStartTour("", store)).toBe(false);
    expect(shouldStartTour("?tour=1", store)).toBe(true);
  });
});
