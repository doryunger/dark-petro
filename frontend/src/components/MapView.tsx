import { AttributionControl, Map as MapboxMap, Marker, NavigationControl, Popup, ScaleControl, type GeoJSONSource } from "mapbox-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import { FLY_ZOOM, MAX_TILE_ZOOM, START_MAX_ZOOM, TABS } from "../lib/constants";
import { toEntry, uniqueEntries } from "../lib/entries";
import { activityTileUrl } from "../lib/filters";
import { featureBounds, shouldFly, topCenter } from "../lib/geo";
import type { Heads } from "../lib/heads";
import { addMapImages } from "../lib/icons";
import { trackEntry } from "../lib/groups";
import { ANCHORS_SOURCE, HOT_SPOT_LINE, TRACK_LINE, activityFocusLayer, anchorLayer, historyIconImage, historyLayer, historySortKey, iconImage, sortKey } from "../lib/layers";
import { FALLBACK_STYLE, styleFor } from "../lib/mapbox";
import { type QueryStyle, TabQuery, anchorId } from "../lib/queryLayers";
import { entryCard } from "../lib/popup";
import { historyPoints } from "../lib/track";
import Legend from "./Legend";
import type { Point } from "../lib/tour";
import type { Bounds, Entry, Filter, LngLat, HotSpotCollection, Order, Tab, TileFeature, TrackLine, TrackPoint } from "../lib/types";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLE = import.meta.env.VITE_MAPBOX_STYLE;
const ERROR_GAP_MS = 10000;
const FIT_MS = 2200;
const SETTLE_TIMEOUT_MS = 5000;

export interface MapHandle {
  flyTo(entry: Entry, always?: boolean): boolean;
  project(point: LngLat): Point | null;
  fitBounds(bounds: Bounds, padding: number, maxZoom?: number): Promise<void>;
  whenSettled(): Promise<void>;
}

interface Props {
  hotSpots: HotSpotCollection;
  tab: Tab;
  track: TrackLine;
  history: TrackPoint[];
  activityFocus: Entry | null;
  pickedId: string | null;
  onPick: (entry: Entry) => void;
  filter: Filter;
  heads: Heads;
  order: Order;
  selectedId: string | null;
  onSelect: (entry: Entry) => void;
  onEntries: (entries: Entry[]) => void;
  onError: (message: string) => void;
  onSettled: () => void;
  children?: ReactNode;
}

function queryStyle(state: { tab: Tab; filter: Filter; heads: Heads; order: Order; selectedId: string | null }, id: Tab): QueryStyle {
  return { order: state.order, selectedId: id === state.tab ? state.selectedId : null, active: id === state.tab, filter: state.filter, heads: state.heads };
}

const MapView = forwardRef<MapHandle, Props>(function MapView({ hotSpots, tab, track, history, activityFocus, pickedId, onPick, filter, heads, order, selectedId, onSelect, onEntries, onError, onSettled, children }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const signature = useRef("");
  const refreshEntries = useRef<() => void>(() => undefined);
  const sets = useRef<Record<Tab, TabQuery>>({
    pairs: new TabQuery("pairs", window.location.origin, () => refreshEntries.current()),
    sanctioned: new TabQuery("sanctioned", window.location.origin, () => refreshEntries.current()),
  });
  const latest = useRef({ hotSpots, tab, track, history, activityFocus, pickedId, onPick, filter, heads, order, selectedId, onSelect, onEntries, onError, onSettled });
  latest.current = { hotSpots, tab, track, history, activityFocus, pickedId, onPick, filter, heads, order, selectedId, onSelect, onEntries, onError, onSettled };

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
    project(point) {
      const map = mapRef.current;
      if (!map) return null;
      const { x, y } = map.project(point);
      const box = map.getContainer().getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    },
    fitBounds(bounds, padding, maxZoom) {
      const map = mapRef.current;
      if (!map) return Promise.resolve();
      return new Promise<void>((resolve) => {
        map.once("moveend", () => resolve());
        map.fitBounds(bounds, { padding, duration: FIT_MS, essential: true, ...(maxZoom === undefined ? {} : { maxZoom }) });
      });
    },
    whenSettled() {
      const map = mapRef.current;
      if (!map) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          map.off("idle", done);
          resolve();
        };
        const timer = setTimeout(done, SETTLE_TIMEOUT_MS);
        map.on("idle", done);
        map.triggerRepaint();
      });
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
    const areas = latest.current.hotSpots;
    map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new AttributionControl({ compact: false }), "bottom-right");

    const labels = areas.features.map((feature) => {
      const label = document.createElement("div");
      label.className = "hot-spot-label";
      label.textContent = feature.properties.label;
      return new Marker({ element: label, anchor: "bottom" }).setLngLat(topCenter(feature)).addTo(map);
    });

    const setup = async () => {
      await addMapImages(map);
      if (!map.getSource("hot-spots")) map.addSource("hot-spots", { type: "geojson", data: areas });
      if (!map.getLayer(HOT_SPOT_LINE.id)) map.addLayer(HOT_SPOT_LINE);
      if (!map.getSource("track")) map.addSource("track", { type: "geojson", data: latest.current.track });
      if (!map.getLayer(TRACK_LINE.id)) map.addLayer(TRACK_LINE);
      if (!map.getSource("history")) map.addSource("history", { type: "geojson", data: historyPoints(latest.current.history) });
      if (!map.getLayer("history")) map.addLayer(historyLayer(latest.current.pickedId));
      if (!map.getSource(ANCHORS_SOURCE)) map.addSource(ANCHORS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      for (const id of TABS) {
        if (!map.getLayer(anchorId(id))) map.addLayer(anchorLayer(anchorId(id)));
        sets.current[id].sync(map, queryStyle(latest.current, id));
      }
      if (latest.current.activityFocus && !map.getSource("activity-focus")) {
        map.addSource("activity-focus", { type: "vector", tiles: [activityTileUrl(window.location.origin, latest.current.activityFocus.id)], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
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
      if (!sets.current[layer].layerIds().some((id) => map.getLayer(id))) return;
      const entries = uniqueEntries(map.queryRenderedFeatures({ layers: sets.current[layer].layerIds().filter((id) => map.getLayer(id)) }) as unknown as TileFeature[], layer, latest.current.heads.counts);
      const next = entries.map((e) => `${e.id}:${e.detections ?? 1}`).sort().join("|");
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
    refreshEntries.current = () => schedule(true);
    map.on("idle", () => schedule(true));
    map.on("moveend", () => schedule(false));

    const start = featureBounds(areas);
    if (start) map.fitBounds(start, { padding: 48, maxZoom: START_MAX_ZOOM, duration: 0 });

    const entryOf = (feature: TileFeature & { layer: { id: string } }, layer: Tab): Entry | null => {
      if (feature.layer.id !== "history") return toEntry(feature, layer, latest.current.heads.counts);
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
      const layers = [...sets.current[layer].layerIds(), "history"].filter((id) => map.getLayer(id));
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
      const layers = [...sets.current[layer].layerIds(), "history"].filter((id) => map.getLayer(id));
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
      for (const id of TABS) sets.current[id].fail(map, sourceId);
      if (TABS.some((id) => sets.current[id].owns(sourceId)) || sourceId === "activity-focus") {
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
    const map = mapRef.current;
    if (!map) return;
    for (const id of TABS) sets.current[id].restyle(map, filter, heads);
  }, [filter, heads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(anchorId("pairs"))) return;
    for (const id of TABS) sets.current[id].sync(map, queryStyle({ ...latest.current, filter }, id));
  }, [filter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (!activityFocus) {
      if (map.getLayer("activity-focus")) map.removeLayer("activity-focus");
      if (map.getSource("activity-focus")) map.removeSource("activity-focus");
      return;
    }
    const tiles = [activityTileUrl(window.location.origin, activityFocus.id)];
    const source = map.getSource("activity-focus") as { setTiles?: (tiles: string[]) => void } | undefined;
    if (source?.setTiles) source.setTiles(tiles);
    else {
      map.addSource("activity-focus", { type: "vector", tiles, minzoom: 0, maxzoom: MAX_TILE_ZOOM });
      map.addLayer(activityFocusLayer());
    }
  }, [activityFocus]);

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
      for (const layerId of sets.current[id].allIds()) if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", id === tab ? "visible" : "none");
    }
    if (map.getLayer(anchorId("pairs"))) for (const id of TABS) sets.current[id].sync(map, queryStyle(latest.current, id));
  }, [tab]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const id of TABS) {
      const picked = id === tab ? selectedId : null;
      for (const layerId of sets.current[id].allIds()) {
        if (!map.getLayer(layerId)) continue;
        map.setLayoutProperty(layerId, "icon-image", iconImage(picked, id));
        map.setLayoutProperty(layerId, "symbol-sort-key", sortKey(order, picked));
      }
    }
  }, [order, selectedId, tab]);

  return (
    <main className="map" data-tour="map">
      <div className="map-canvas" ref={container} />
      <Legend tab={tab} />
      {children}
    </main>
  );
});

export default MapView;
