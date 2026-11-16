import { describe, expect, it } from "vitest";
import { activityTileUrl, matches, tileUrl } from "./filters";

const filter = { from: "2026-10-17", to: "2026-10-24", sources: ["s2", "s1"] };

describe("filters", () => {
  it("puts the whole query, in a fixed order, in the tile url and nothing else", () => {
    expect(tileUrl("https://x.test", "pairs", filter)).toBe("https://x.test/tiles/{z}/{x}/{y}.mvt?from=2026-10-17&to=2026-10-24&source=s1,s2");
    expect(tileUrl("https://x.test", "sanctioned", filter)).toBe("https://x.test/tiles/sanctioned/{z}/{x}/{y}.mvt?from=2026-10-17&to=2026-10-24&source=s1,s2");
    expect(activityTileUrl("https://x.test", "a b")).toBe("https://x.test/tiles/activity/{z}/{x}/{y}.mvt?id=a%20b");
  });

  it("matches on date, both ends included, and on source", () => {
    expect(matches({ date: "2026-10-17", source: "s1" }, filter)).toBe(true);
    expect(matches({ date: "2026-10-24", source: "s2" }, filter)).toBe(true);
    expect(matches({ date: "2026-10-16", source: "s1" }, filter)).toBe(false);
    expect(matches({ date: "2026-10-25", source: "s1" }, filter)).toBe(false);
    expect(matches({ date: "2026-10-20", source: "s3" }, filter)).toBe(false);
  });
});
