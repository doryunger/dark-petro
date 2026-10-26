import { describe, expect, it } from "vitest";
import { trackUrl } from "./filters";
import { historyPoints, trackLine } from "./track";
import type { TrackPoint } from "./types";

const point = (id: string, t: number, lon: number, lat: number, yaw: number | null = null): TrackPoint => ({ id, date: "2026-10-19", t, hot_spot: "off_sohar", source: "s1", image: null, yaw, lon, lat, name: "X", flag: null, imo: "1" });

describe("track", () => {
  it("draws one line through the captures from the newest to the oldest, whatever order they come in", () => {
    const line = trackLine([point("b", 20, 2, 2), point("c", 30, 3, 3), point("a", 10, 1, 1)]);
    expect(line.features).toHaveLength(1);
    expect(line.features[0].geometry).toEqual({ type: "LineString", coordinates: [[3, 3], [2, 2], [1, 1]] });
  });

  it("draws nothing for a vessel seen once or never", () => {
    expect(trackLine([]).features).toEqual([]);
    expect(trackLine([point("a", 1, 1, 1)]).features).toEqual([]);
  });

  it("turns the other detections into points with their ID and heading, leaving the heading out when there is none", () => {
    const { features } = historyPoints([point("a", 1, 56.5, 24.7, 93.3), point("b", 2, 56.6, 24.8)]);
    expect(features.map((f) => f.properties)).toEqual([{ id: "a", yaw: 93.3 }, { id: "b" }]);
    expect(features[0].geometry).toEqual({ type: "Point", coordinates: [56.5, 24.7] });
    expect(historyPoints([]).features).toEqual([]);
  });

  it("asks for the path of one vessel under the same filters as the tiles", () => {
    const filter = { from: "2026-10-17", to: "2026-10-24", sources: ["s2", "s1"] };
    expect(trackUrl("9257149", filter)).toBe("/tracks/9257149?from=2026-10-17&to=2026-10-24&source=s1,s2");
  });
});
