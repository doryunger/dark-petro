import { describe, expect, it } from "vitest";
import { entryIconClass, hotSpotLabel, shortId, sortEntries, sourceName, toEntry, uniqueEntries } from "./entries";
import type { Entry, TileFeature } from "./types";

const feature = (id: string, extra: Record<string, string | number | boolean | undefined> = {}): TileFeature => ({
  geometry: { coordinates: [57.6, 24.62] },
  properties: { id, lon: 57.5973, lat: 24.6244, date: "2026-10-21", t: 1792565558, hot_spot: "off_sohar", source: "s2", sanctioned: true, image: "captures/a.png", yaw: 192.4, v1_name: "ONE", v1_flag: "PA", v1_imo: "9123456", v1_sanctioned: false, v2_flag: "KM", v2_sanctioned: true, ...extra },
});

describe("entries", () => {
  it("shows everything after the second underscore as the ID", () => {
    expect(shortId("s2_20261021T065238_56045-272349")).toBe("56045-272349");
    expect(shortId("s1_20261021T021407_a_b-1")).toBe("a_b-1");
    expect(shortId("s1_20261022T224733_w0-33113-13846")).toBe("33113-13846");
  });

  it("names the hot spots and the sources", () => {
    expect(hotSpotLabel("johor_east_scs")).toBe("Johor East SCS");
    expect(hotSpotLabel("unknown_place")).toBe("unknown_place");
    expect(sourceName("s1")).toBe("Sentinel-1");
  });

  it("reads a tile feature, leaving out what the tile leaves out", () => {
    const e = toEntry(feature("s2_20261021T065238_56045-272349"));
    expect(e).toMatchObject({ shortId: "56045-272349", date: "2026-10-21", hotSpot: "off_sohar", source: "s2", sanctioned: true, image: "captures/a.png", lon: 57.5973, lat: 24.6244 });
    expect(e.vessels[0]).toEqual({ name: "ONE", flag: "PA", imo: "9123456", sanctioned: false, known: true });
    expect(e.vessels[1]).toEqual({ name: null, flag: "KM", imo: null, sanctioned: true, known: false });
  });

  it("reads a sanctioned vessel as one sanctioned vessel, whatever the tile says about pairs", () => {
    const single = feature("s1_20261019T141603_w0-44977-274982", { sanctioned: undefined, v1_name: "NESO", v1_flag: "ST", v1_imo: "9257149", v1_sanctioned: undefined, v2_flag: undefined, v2_sanctioned: undefined });
    const e = toEntry(single, "sanctioned");
    expect(e).toMatchObject({ tab: "sanctioned", shortId: "44977-274982", sanctioned: true, source: "s2" });
    expect(e.vessels).toEqual([{ name: "NESO", flag: "ST", imo: "9257149", sanctioned: true, known: true }]);
    expect(toEntry(feature("s2_1_a")).tab).toBe("pairs");
    expect(toEntry(feature("s2_1_a")).vessels).toHaveLength(2);
  });

  it("draws a pair icon or a single-vessel icon, red when sanctioned", () => {
    expect(entryIconClass({ tab: "pairs", sanctioned: false })).toBe("entry-icon");
    expect(entryIconClass({ tab: "pairs", sanctioned: true })).toBe("entry-icon entry-icon-sanctioned");
    expect(entryIconClass({ tab: "sanctioned", sanctioned: true })).toBe("entry-icon entry-icon-vessel entry-icon-sanctioned");
  });

  it("keeps one entry per vessel in the sanctioned tab too", () => {
    const list = uniqueEntries([feature("s2_1_a"), feature("s2_1_a")], "sanctioned");
    expect(list.map((e) => [e.id, e.tab])).toEqual([["s2_1_a", "sanctioned"]]);
  });

  it("takes the exact position from the attributes, and the tile geometry only when they are missing", () => {
    const exact = toEntry(feature("s2_1_a"));
    expect([exact.lon, exact.lat]).toEqual([57.5973, 24.6244]);
    const rough = toEntry(feature("s2_1_a", { lon: undefined, lat: undefined }));
    expect([rough.lon, rough.lat]).toEqual([57.6, 24.62]);
  });

  it("keeps one entry per pair when a pair is in two tiles", () => {
    const list = uniqueEntries([feature("s2_1_a"), feature("s2_2_b"), feature("s2_1_a")]);
    expect(list.map((e) => e.id)).toEqual(["s2_1_a", "s2_2_b"]);
  });

  it("sorts newest first or oldest first, and by id on equal times", () => {
    const list = [{ id: "b", t: 5 }, { id: "a", t: 5 }, { id: "c", t: 9 }, { id: "d", t: 1 }] as Entry[];
    expect(sortEntries(list, "latest").map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
    expect(sortEntries(list, "oldest").map((e) => e.id)).toEqual(["d", "a", "b", "c"]);
    expect(list.map((e) => e.id)).toEqual(["b", "a", "c", "d"]);
  });
});
