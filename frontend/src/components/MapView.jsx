import { AttributionControl, Map, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import hotSpots from "../data/hot_spots.json";
import { FLY_ZOOM, MAX_TILE_ZOOM, QUERY_ZOOM, START_MAX_ZOOM } from "../lib/constants.js";
import { toEntry, uniqueEntries } from "../lib/entries.js";
import { tileUrl } from "../lib/filters.js";
import { featureBounds, shouldFly, topCenter } from "../lib/geo.js";
import { addPairImages } from "../lib/icons.js";
import { HOT_SPOT_LINE, iconImage, pairsLayer, sortKey } from "../lib/layers.js";
import { FALLBACK_STYLE, styleFor, transformRequest } from "../lib/mapbox.js";
import { entryCard } from "../lib/popup.js";

setWorkerUrl(workerUrl);

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const ERROR_GAP_MS = 10000;

const MapView = forwardRef(function MapView({ filter, order, selectedId, onSelect, onEntries, onError, children }, ref) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const queryBounds = useRef(null);
  const latest = useRef({});
  const [showBack, setShowBack] = useState(false);
  latest.current = { filter, order, selectedId, onSelect, onEntries, onError };

  useImperativeHandle(ref, () => ({
    flyTo(entry, fromMap) {
      const map = mapRef.current;
      if (!map || !shouldFly(map.getZoom(), fromMap)) return;
      map.flyTo({ center: [entry.lon, entry.lat], zoom: FLY_ZOOM, essential: true });
    },
  }), []);

  useEffect(() => {
    const map = new Map({
      container: container.current,
      style: styleFor(TOKEN),
      transformRequest: transformRequest(TOKEN),
      center: [81, 13],
      zoom: 3,
      maxZoom: 18,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: false,
      touchPitch: false,
      maxPitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new AttributionControl({ compact: false }), "bottom-right");

    const labels = hotSpots.features.map((feature) => {
      const label = document.createElement("div");
      label.className = "hot-spot-label";
      label.textContent = feature.properties.label;
      return new Marker({ element: label, anchor: "bottom" }).setLngLat(topCenter(feature)).addTo(map);
    });

    const setup = async () => {
      await addPairImages(map);
      if (!map.getSource("hot-spots")) map.addSource("hot-spots", { type: "geojson", data: hotSpots });
      if (!map.getLayer(HOT_SPOT_LINE.id)) map.addLayer(HOT_SPOT_LINE);
      if (!map.getSource("pairs")) {
        map.addSource("pairs", { type: "vector", tiles: [tileUrl(window.location.origin, latest.current.filter)], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
      }
      if (!map.getLayer("pairs")) map.addLayer(pairsLayer(latest.current));
    };
    map.on("style.load", setup);

    let signature = "";
    let frame = 0;
    const refresh = () => {
      if (!map.getLayer("pairs")) return;
      const entries = uniqueEntries(map.queryRenderedFeatures({ layers: ["pairs"] }));
      const next = entries.map((e) => e.id).sort().join("|");
      if (next === signature) return;
      signature = next;
      latest.current.onEntries(entries);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    map.on("idle", schedule);
    map.on("moveend", schedule);

    map.on("zoom", () => {
      const next = map.getZoom() > QUERY_ZOOM;
      setShowBack((prev) => (prev === next ? prev : next));
    });
    map.on("moveend", () => {
      if (map.getZoom() <= QUERY_ZOOM) queryBounds.current = map.getBounds();
    });
    map.fitBounds(featureBounds(hotSpots), { padding: 48, maxZoom: START_MAX_ZOOM, duration: 0 });
    queryBounds.current = map.getBounds();

    const popup = new Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, offset: 14, anchor: "bottom", maxWidth: "none" });
    let hoverId = null;
    const hide = () => {
      hoverId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    map.on("mousemove", (e) => {
      if (!map.getLayer("pairs")) return;
      const feature = map.queryRenderedFeatures(e.point, { layers: ["pairs"] })[0];
      if (!feature) return hide();
      map.getCanvas().style.cursor = "pointer";
      if (feature.properties.id === hoverId) return;
      hoverId = feature.properties.id;
      popup.setLngLat(feature.geometry.coordinates).setDOMContent(entryCard(toEntry(feature))).addTo(map);
    });
    map.on("mouseout", hide);
    map.on("click", (e) => {
      if (!map.getLayer("pairs")) return;
      const feature = map.queryRenderedFeatures(e.point, { layers: ["pairs"] })[0];
      if (feature) latest.current.onSelect(toEntry(feature));
    });

    let lastError = 0;
    let fellBack = false;
    map.on("error", (e) => {
      const now = Date.now();
      if (e.sourceId === "pairs") {
        if (now - lastError > ERROR_GAP_MS) latest.current.onError("Could not load the map data. Check the connection and try again.");
        lastError = now;
      } else if (TOKEN && !fellBack && !map.isStyleLoaded()) {
        fellBack = true;
        latest.current.onError("Could not load the basemap. Showing a plain background.");
        map.setStyle(FALLBACK_STYLE);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      labels.forEach((marker) => marker.remove());
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("pairs");
    if (source) source.setTiles([tileUrl(window.location.origin, filter)]);
  }, [filter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("pairs")) return;
    map.setLayoutProperty("pairs", "icon-image", iconImage(selectedId));
    map.setLayoutProperty("pairs", "symbol-sort-key", sortKey(order, selectedId));
  }, [order, selectedId]);

  const back = () => {
    const map = mapRef.current;
    if (map && queryBounds.current) map.fitBounds(queryBounds.current, { maxZoom: QUERY_ZOOM, padding: 0 });
  };

  return (
    <main className="map">
      <div className="map-canvas" ref={container} />
      {children}
      {showBack && (
        <button className="back-button" type="button" onClick={back}>
          Back to query area
        </button>
      )}
    </main>
  );
});

export default MapView;
