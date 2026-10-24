import { describe, expect, it } from "vitest";
import { FALLBACK_STYLE, mapboxUrl, styleFor, transformRequest } from "./mapbox.js";

const T = "pk.test";

describe("mapbox", () => {
  it("loads the Navigation Night style by its web address when there is a token, and a plain background when there is none", () => {
    expect(styleFor(T)).toBe("https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1?access_token=pk.test");
    expect(styleFor("")).toBe(FALLBACK_STYLE);
    expect(FALLBACK_STYLE.layers[0].type).toBe("background");
  });

  it("turns the mapbox:// addresses of a style into web addresses", () => {
    expect(mapboxUrl("mapbox://styles/mapbox/navigation-night-v1", T)).toBe("https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1?access_token=pk.test");
    expect(mapboxUrl("mapbox://sprites/mapbox/navigation-night-v1@2x.png", T)).toBe("https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/sprite@2x.png?access_token=pk.test");
    expect(mapboxUrl("mapbox://sprites/mapbox/navigation-night-v1.json", T)).toBe("https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/sprite.json?access_token=pk.test");
    expect(mapboxUrl("mapbox://fonts/mapbox/DIN Pro Medium,Arial Unicode MS Regular/0-255.pbf", T)).toBe("https://api.mapbox.com/fonts/v1/mapbox/DIN Pro Medium,Arial Unicode MS Regular/0-255.pbf?access_token=pk.test");
    expect(mapboxUrl("mapbox://mapbox.satellite", T)).toBe("https://api.mapbox.com/v4/mapbox.satellite.json?secure&access_token=pk.test");
    expect(mapboxUrl("mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2", T)).toBe("https://api.mapbox.com/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2.json?secure&access_token=pk.test");
  });

  it("adds the token to mapbox tile addresses that lack one, and leaves other addresses alone", () => {
    expect(mapboxUrl("https://api.mapbox.com/v4/mapbox.satellite/3/4/5.webp", T)).toBe("https://api.mapbox.com/v4/mapbox.satellite/3/4/5.webp?access_token=pk.test");
    expect(mapboxUrl("https://a.tiles.mapbox.com/v4/x/1/2/3.mvt?sku=1", T)).toBe("https://a.tiles.mapbox.com/v4/x/1/2/3.mvt?sku=1&access_token=pk.test");
    expect(mapboxUrl("https://api.mapbox.com/v4/x.json?access_token=pk.other", T)).toBeNull();
    expect(mapboxUrl("https://viewer.test/tiles/1/2/3.mvt", T)).toBeNull();
  });

  it("never touches a request when there is no token", () => {
    expect(transformRequest("")("https://viewer.test/tiles/1/2/3.mvt")).toEqual({ url: "https://viewer.test/tiles/1/2/3.mvt" });
    expect(transformRequest(T)("https://viewer.test/captures/a.png")).toEqual({ url: "https://viewer.test/captures/a.png" });
  });
});
