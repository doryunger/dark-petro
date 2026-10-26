import { FLY_UP_TO_ZOOM } from "./constants";
import type { Bounds, HotSpotCollection, HotSpotFeature, LngLat } from "./types";

export function shouldFly(zoom: number): boolean {
  return zoom <= FLY_UP_TO_ZOOM;
}

export function featureBounds(collection: HotSpotCollection): Bounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of collection.features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return [[west, south], [east, north]];
}

export function topCenter(feature: HotSpotFeature): LngLat {
  const ring = feature.geometry.coordinates[0];
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, Math.max(...lats)];
}
