import { describe, expect, it } from "vitest";
import { historyHeight, historyOf, imoOf, trackEntry } from "./groups";
import type { Entry, TrackPoint } from "./types";

const entry = (id: string, t: number, imo: string | null, tab: Entry["tab"] = "sanctioned") =>
  ({ id, t, tab, vessels: [{ name: "X", flag: null, imo, sanctioned: true, known: true }] }) as Entry;

const point = (id: string, t: number): TrackPoint => ({ id, date: "2026-10-19", t, hot_spot: "off_sohar", source: "s1", image: "captures/a.png", yaw: 12, lon: 56.5, lat: 24.7, name: "AUROURA", flag: "PA", imo: "9262912" });

describe("groups", () => {
  it("has an IMO only for a sanctioned vessel", () => {
    expect(imoOf(entry("a", 1, "9"))).toBe("9");
    expect(imoOf(entry("a", 1, null))).toBeNull();
    expect(imoOf(entry("a", 1, "9", "pairs"))).toBeNull();
  });

  it("makes a reel entry from a path point", () => {
    const e = trackEntry(point("s1_20261019T141603_w0-44977-274982", 5));
    expect(e).toMatchObject({ tab: "sanctioned", shortId: "44977-274982", date: "2026-10-19", hotSpot: "off_sohar", source: "s1", sanctioned: true, image: "captures/a.png", lon: 56.5, lat: 24.7 });
    expect(e.vessels).toEqual([{ name: "AUROURA", flag: "PA", imo: "9262912", sanctioned: true, known: true }]);
  });

  it("sizes the history box to its rows and never above the maximum", () => {
    expect(historyHeight(1)).toBe(2.25);
    expect(historyHeight(2)).toBe(4);
    expect(historyHeight(3)).toBe(5.75);
    expect(historyHeight(4)).toBe(5.75);
    expect(historyHeight(40)).toBe(5.75);
  });

  it("lists the other detections of a vessel, newest first, without the card's own", () => {
    const list = historyOf([point("a", 10), point("head", 40), point("c", 30), point("d", 20)], "head");
    expect(list.map((e) => e.id)).toEqual(["c", "d", "a"]);
    expect(historyOf([point("head", 1)], "head")).toEqual([]);
  });
});
