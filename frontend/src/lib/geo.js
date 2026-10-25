import { MAP_CLICK_FLY_ZOOM, QUERY_ZOOM } from "./constants.js";

export function shouldFly(zoom, fromMap) {
  return zoom <= (fromMap ? MAP_CLICK_FLY_ZOOM : QUERY_ZOOM);
}

export function featureBounds(collection) {
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

export function topCenter(feature) {
  const ring = feature.geometry.coordinates[0];
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, Math.max(...lats)];
}
