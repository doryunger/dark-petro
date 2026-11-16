import { describe, expect, it } from "vitest";
import { latestPerVessel, rangeSeconds } from "./heads";
import type { SanctionedDetection } from "./types";

const day = (d: number, h = 6) => Date.UTC(2026, 9, d, h) / 1000;
const detection = (id: string, imo: string | null, t: number, source = "s1"): SanctionedDetection => ({ id, imo, t, source });
const filter = (from: string, to: string, sources = ["s1", "s2"]) => ({ from, to, sources });

const all = [
  detection("a1", "111", day(12)),
  detection("a2", "111", day(21)),
  detection("a3", "111", day(21, 9), "s2"),
  detection("b1", "222", day(15)),
  detection("n1", null, day(15)),
  detection("n2", null, day(15, 7)),
];

describe("sanctioned vessel heads", () => {
  it("covers the whole last day: the range ends at the start of the day after", () => {
    expect(rangeSeconds(filter("2026-10-17", "2026-10-24"))).toEqual([Date.UTC(2026, 9, 17) / 1000, Date.UTC(2026, 9, 25) / 1000]);
  });

  it("picks each vessel's newest detection inside the range and counts the detections it has there", () => {
    const heads = latestPerVessel(all, filter("2026-10-01", "2026-10-31"));
    expect(heads.counts).toEqual({ a3: 3, b1: 1, n1: 1, n2: 1 });
    expect([...heads.ids].sort()).toEqual(["a3", "b1", "n1", "n2"]);
  });

  it("moves the head back when the newer detections fall outside the range, and drops a vessel with none left", () => {
    expect(latestPerVessel(all, filter("2026-10-01", "2026-10-20")).counts).toEqual({ a1: 1, b1: 1, n1: 1, n2: 1 });
    expect(latestPerVessel(all, filter("2026-10-16", "2026-10-31")).counts).toEqual({ a3: 2 });
  });

  it("looks only at the chosen sources and treats a vessel without an IMO as its own vessel", () => {
    expect(latestPerVessel(all, filter("2026-10-01", "2026-10-31", ["s1"])).counts).toEqual({ a2: 2, b1: 1, n1: 1, n2: 1 });
    expect(latestPerVessel(all, filter("2026-10-01", "2026-10-31", ["s2"])).counts).toEqual({ a3: 1 });
    expect(latestPerVessel(all, filter("2026-10-01", "2026-10-31", [])).ids).toEqual([]);
  });

  it("breaks a tie on capture time by the lower id, as the server did", () => {
    const tie = [detection("z", "9", day(10)), detection("y", "9", day(10))];
    expect(latestPerVessel(tie, filter("2026-10-01", "2026-10-31")).counts).toEqual({ y: 2 });
  });
});
