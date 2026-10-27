import { AttributionControl, Map as MapboxMap, Marker, NavigationControl, Popup, ScaleControl, type GeoJSONSource } from "mapbox-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import hotSpots from "../data/hot_spots.json";
import { FLY_ZOOM, MAX_TILE_ZOOM, START_MAX_ZOOM, TABS } from "../lib/constants";
import { toEntry, uniqueEntries } from "../lib/entries";
import { activityTileUrl, tileUrl } from "../lib/filters";
import { featureBounds, shouldFly, topCenter } from "../lib/geo";
import { addMapImages } from "../lib/icons";
import { trackEntry } from "../lib/groups";
import { HOT_SPOT_LINE, TRACK_LINE, activityFocusLayer, historyIconImage, historyLayer, historySortKey, iconImage, sortKey, symbolLayer } from "../lib/layers";
import { FALLBACK_STYLE, styleFor } from "../lib/mapbox";
import { entryCard } from "../lib/popup";
import { historyPoints } from "../lib/track";
import type { Entry, Filter, Order, Tab, TileFeature, TrackLine, TrackPoint } from "../lib/types";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLE = import.meta.env.VITE_MAPBOX_STYLE;
const ERROR_GAP_MS = 10000;

export interface MapHandle {
  flyTo(entry: Entry, always?: boolean): boolean;
}

interface Props {
  tab: Tab;
  track: TrackLine;
  history: TrackPoint[];
  activityFocus: Entry | null;
  pickedId: string | null;
  onPick: (entry: Entry) => void;
  filter: Filter;
  order: Order;
  selectedId: string | null;
  onSelect: (entry: Entry) => void;
  onEntries: (entries: Entry[]) => void;
  onError: (message: string) => void;
  onSettled: () => void;
  children?: ReactNode;
}

const MapView = forwardRef<MapHandle, Props>(function MapView({ tab, track, history, activityFocus, pickedId, onPick, filter, order, selectedId, onSelect, onEntries, onError, onSettled, children }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const signature = useRef("");
  const latest = useRef({ tab, track, history, activityFocus, pickedId, onPick, filter, order, selectedId, onSelect, onEntries, onError, onSettled });
  latest.current = { tab, track, history, activityFocus, pickedId, onPick, filter, order, selectedId, onSelect, onEntries, onError, onSettled };

  useImperativeHandle(ref, () => ({
    flyTo(entry, always = false) {
      const map = mapRef.current;
      if (!map) return false;
      const zoom = map.getZoom();
      const far = shouldFly(zoom);
      const outside = !map.getBounds().contains([entry.lon, entry.lat]);
      if (!far && !always && !outside) return false;
      map.flyTo({ center: [entry.lon, entry.lat], zoom: far ? FLY_ZOOM : zoom, essential: true });
      return true;
    },
  }), []);

  useEffect(() => {
    if (!container.current) return undefined;
    const map = new MapboxMap({
      container: container.current,
      style: styleFor(TOKEN, STYLE),
      accessToken: TOKEN,
      projection: "mercator",
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
      await addMapImages(map);
      if (!map.getSource("hot-spots")) map.addSource("hot-spots", { type: "geojson", data: hotSpots });
      if (!map.getLayer(HOT_SPOT_LINE.id)) map.addLayer(HOT_SPOT_LINE);
      if (!map.getSource("track")) map.addSource("track", { type: "geojson", data: latest.current.track });
      if (!map.getLayer(TRACK_LINE.id)) map.addLayer(TRACK_LINE);
      if (!map.getSource("history")) map.addSource("history", { type: "geojson", data: historyPoints(latest.current.history) });
      if (!map.getLayer("history")) map.addLayer(historyLayer(latest.current.pickedId));
      for (const id of TABS) {
        const { tab: active, filter: current, order: sort, selectedId: picked } = latest.current;
        if (!map.getSource(id)) {
          map.addSource(id, { type: "vector", tiles: [tileUrl(window.location.origin, current, id)], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
        }
        if (!map.getLayer(id)) map.addLayer(symbolLayer(id, { order: sort, selectedId: id === active ? picked : null, active: id === active }));
      }
      if (latest.current.activityFocus && !map.getSource("activity-focus")) {
        map.addSource("activity-focus", { type: "vector", tiles: [activityTileUrl(window.location.origin, latest.current.filter, latest.current.activityFocus.id)], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
      }
      if (latest.current.activityFocus && !map.getLayer("activity-focus")) map.addLayer(activityFocusLayer());
    };
    map.on("style.load", setup);

    let frame = 0;
    let settled = false;
    const refresh = () => {
      const done = settled;
      settled = false;
      const layer = latest.current.tab;
      if (!map.getLayer(layer)) return;
      const entries = uniqueEntries(map.queryRenderedFeatures({ layers: [layer] }) as unknown as TileFeature[], layer);
      const next = entries.map((e) => e.id).sort().join("|");
      if (next !== signature.current) {
        signature.current = next;
        latest.current.onEntries(entries);
      }
      if (done) latest.current.onSettled();
    };
    const schedule = (isIdle: boolean) => {
      settled = settled || isIdle;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    map.on("idle", () => schedule(true));
    map.on("moveend", () => schedule(false));

    map.fitBounds(featureBounds(hotSpots), { padding: 48, maxZoom: START_MAX_ZOOM, duration: 0 });

    const entryOf = (feature: TileFeature & { layer: { id: string } }, layer: Tab): Entry | null => {
      if (feature.layer.id !== "history") return toEntry(feature, layer);
      const point = latest.current.history.find((p) => p.id === feature.properties.id);
      return point ? trackEntry(point) : null;
    };

    const popup = new Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, offset: 14, anchor: "bottom", maxWidth: "none" });
    let hoverId: string | null = null;
    const hide = () => {
      hoverId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    map.on("mousemove", (e) => {
      const layer = latest.current.tab;
      const layers = [layer, "history"].filter((id) => map.getLayer(id));
      if (!layers.length) return;
      const found = map.queryRenderedFeatures(e.point, { layers })[0];
      if (!found) return hide();
      map.getCanvas().style.cursor = "pointer";
      const tile = found as unknown as TileFeature;
      if (tile.properties.id === hoverId) return;
      const entry = entryOf(found as unknown as TileFeature & { layer: { id: string } }, layer);
      if (!entry) return hide();
      hoverId = tile.properties.id;
      popup.setLngLat(tile.geometry.coordinates as [number, number]).setDOMContent(entryCard(entry)).addTo(map);
    });
    map.on("mouseout", hide);
    map.on("click", (e) => {
      const layer = latest.current.tab;
      const layers = [layer, "history"].filter((id) => map.getLayer(id));
      if (!layers.length) return;
      const feature = map.queryRenderedFeatures(e.point, { layers })[0];
      if (!feature) return;
      const entry = entryOf(feature as unknown as TileFeature & { layer: { id: string } }, layer);
      if (!entry) return;
      if ((feature as unknown as { layer: { id: string } }).layer.id === "history") latest.current.onPick(entry);
      else latest.current.onSelect(entry);
    });

    let lastError = 0;
    let fellBack = false;
    map.on("error", (e) => {
      const now = Date.now();
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (TABS.includes(sourceId as Tab) || sourceId === "activity-focus") {
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
      labels.forEach((marker) => {
        marker.remove();
      });
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    for (const id of TABS) {
      const source = mapRef.current?.getSource(id) as { setTiles?: (tiles: string[]) => void } | undefined;
      if (source?.setTiles) source.setTiles([tileUrl(window.location.origin, filter, id)]);
    }
  }, [filter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (!activityFocus) {
      if (map.getLayer("activity-focus")) map.removeLayer("activity-focus");
      if (map.getSource("activity-focus")) map.removeSource("activity-focus");
      return;
    }
    const tiles = [activityTileUrl(window.location.origin, filter, activityFocus.id)];
    const source = map.getSource("activity-focus") as { setTiles?: (tiles: string[]) => void } | undefined;
    if (source?.setTiles) source.setTiles(tiles);
    else {
      map.addSource("activity-focus", { type: "vector", tiles, minzoom: 0, maxzoom: MAX_TILE_ZOOM });
      map.addLayer(activityFocusLayer());
    }
  }, [activityFocus, filter]);

  useEffect(() => {
    (mapRef.current?.getSource("track") as GeoJSONSource | undefined)?.setData(track);
  }, [track]);

  useEffect(() => {
    (mapRef.current?.getSource("history") as GeoJSONSource | undefined)?.setData(historyPoints(history));
  }, [history]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("history")) return;
    map.setLayoutProperty("history", "icon-image", historyIconImage(pickedId));
    map.setLayoutProperty("history", "symbol-sort-key", historySortKey(pickedId));
  }, [pickedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    signature.current = "";
    for (const id of TABS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", id === tab ? "visible" : "none");
    }
  }, [tab]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of TABS) {
      if (!map.getLayer(id)) continue;
      const picked = id === tab ? selectedId : null;
      map.setLayoutProperty(id, "icon-image", iconImage(picked, id));
      map.setLayoutProperty(id, "symbol-sort-key", sortKey(order, picked));
    }
  }, [order, selectedId, tab]);

  return (
    <main className="map">
      <div className="map-canvas" ref={container} />
      {children}
    </main>
  );
});

export default MapView;
