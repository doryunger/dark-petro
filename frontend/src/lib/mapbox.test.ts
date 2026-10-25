import { describe, expect, it } from "vitest";
import { FALLBACK_STYLE, stylePath, styleFor } from "./mapbox";

describe("mapbox", () => {
  it("uses the Navigation Night style when there is a token and no custom style, and a plain background when there is no token", () => {
    expect(styleFor("pk.test")).toBe("mapbox://styles/mapbox/navigation-night-v1");
    expect(styleFor("")).toBe(FALLBACK_STYLE);
    expect(FALLBACK_STYLE.layers[0].type).toBe("background");
  });

  it("takes a custom style as a mapbox:// address or as user/id", () => {
    expect(stylePath("mapbox://styles/someone/abc123")).toBe("someone/abc123");
    expect(stylePath(" someone/abc123/ ")).toBe("someone/abc123");
    expect(stylePath("")).toBe("mapbox/navigation-night-v1");
    expect(stylePath(undefined)).toBe("mapbox/navigation-night-v1");
    expect(styleFor("pk.test", "mapbox://styles/someone/abc123")).toBe("mapbox://styles/someone/abc123");
    expect(styleFor("", "someone/abc123")).toBe(FALLBACK_STYLE);
  });
});
