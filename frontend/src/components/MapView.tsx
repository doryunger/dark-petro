import { AttributionControl, Map as MapboxMap, Marker, NavigationControl, Popup, ScaleControl, type GeoJSONSource } from "mapbox-gl";
import { createEffect, createSignal, onSettled, untrack } from "solid-js";
import type { JSX } from "@solidjs/web";
import { FLY_ZOOM, MAX_TILE_ZOOM, START_MAX_ZOOM, TABS } from "../lib/constants";
import { toEntry, uniqueEntries } from "../lib/entries";
import { activityTileUrl } from "../lib/filters";
import { featureBounds, shouldFly, topCenter } from "../lib/geo";
import type { Heads } from "../lib/heads";
import { addMapImages } from "../lib/icons";
import { trackEntry } from "../lib/groups";
import { ANCHORS_SOURCE, HOT_SPOT_LINE, TRACK_LINE, activityFocusLayer, anchorLayer, historyIconImage, historyLayer, historySortKey, iconImage, sortKey } from "../lib/layers";
import { FALLBACK_STYLE, STYLE_CONFIG, styleFor } from "../lib/mapbox";
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
  ref?: (handle: MapHandle) => void;
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
  children?: JSX.Element;
}

function queryStyle(state: { tab: Tab; filter: Filter; heads: Heads; order: Order; selectedId: string | null }, id: Tab): QueryStyle {
  return { order: state.order, selectedId: id === state.tab ? state.selectedId : null, active: id === state.tab, filter: state.filter, heads: state.heads };
}

export default function MapView(props: Props) {
  let container: HTMLDivElement | undefined;
  const [map, setMap] = createSignal<MapboxMap | undefined>();
  let signature = "";
  let refreshEntries: () => void = () => undefined;
  const sets: Record<Tab, TabQuery> = {
    pairs: new TabQuery("pairs", window.location.origin, () => refreshEntries()),
    sanctioned: new TabQuery("sanctioned", window.location.origin, () => refreshEntries()),
  };

  const handle: MapHandle = {
    flyTo(entry, always = false) {
      const current = map();
      if (!current) return false;
      const zoom = current.getZoom();
      const far = shouldFly(zoom);
      const outside = !current.getBounds().contains([entry.lon, entry.lat]);
      if (!far && !always && !outside) return false;
      current.flyTo({ center: [entry.lon, entry.lat], zoom: far ? FLY_ZOOM : zoom, essential: true });
      return true;
    },
    project(point) {
      const current = map();
      if (!current) return null;
      const { x, y } = current.project(point);
      const box = current.getContainer().getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    },
    fitBounds(bounds, padding, maxZoom) {
      const current = map();
      if (!current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        current.once("moveend", () => resolve());
        current.fitBounds(bounds, { padding, duration: FIT_MS, essential: true, ...(maxZoom === undefined ? {} : { maxZoom }) });
      });
    },
    whenSettled() {
      const current = map();
      if (!current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          current.off("idle", done);
          resolve();
        };
        const timer = setTimeout(done, SETTLE_TIMEOUT_MS);
        current.on("idle", done);
        current.triggerRepaint();
      });
    },
  };

  onSettled(() => {
    if (!container) return undefined;
    props.ref?.(handle);
    const instance = new MapboxMap({
      container,
      style: styleFor(TOKEN, STYLE),
      config: STYLE_CONFIG,
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
    const areas = props.hotSpots;
    instance.keyboard.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    instance.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    instance.addControl(new AttributionControl({ compact: false }), "bottom-right");

    const labels = areas.features.map((feature) => {
      const label = document.createElement("div");
      label.className = "hot-spot-label";
      label.textContent = feature.properties.label;
      return new Marker({ element: label, anchor: "bottom" }).setLngLat(topCenter(feature)).addTo(instance);
    });

    const setup = async () => {
      await addMapImages(instance);
      if (!instance.getSource("hot-spots")) instance.addSource("hot-spots", { type: "geojson", data: areas });
      if (!instance.getLayer(HOT_SPOT_LINE.id)) instance.addLayer(HOT_SPOT_LINE);
      if (!instance.getSource("track")) instance.addSource("track", { type: "geojson", data: props.track });
      if (!instance.getLayer(TRACK_LINE.id)) instance.addLayer(TRACK_LINE);
      if (!instance.getSource("history")) instance.addSource("history", { type: "geojson", data: historyPoints(props.history) });
      if (!instance.getLayer("history")) instance.addLayer(historyLayer(props.pickedId));
      if (!instance.getSource(ANCHORS_SOURCE)) instance.addSource(ANCHORS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      for (const id of TABS) {
        if (!instance.getLayer(anchorId(id))) instance.addLayer(anchorLayer(anchorId(id)));
        sets[id].sync(instance, queryStyle(props, id));
      }
      if (props.activityFocus && !instance.getSource("activity-focus")) {
        instance.addSource("activity-focus", { type: "vector", tiles: [activityTileUrl(window.location.origin, props.activityFocus.id)], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
      }
      if (props.activityFocus && !instance.getLayer("activity-focus")) instance.addLayer(activityFocusLayer());
    };
    instance.on("style.load", setup);

    let frame = 0;
    let settled = false;
    const refresh = () => {
      const done = settled;
      settled = false;
      const layer = props.tab;
      if (!sets[layer].layerIds().some((id) => instance.getLayer(id))) return;
      const entries = uniqueEntries(instance.queryRenderedFeatures({ layers: sets[layer].layerIds().filter((id) => instance.getLayer(id)) }) as unknown as TileFeature[], layer, props.heads.counts);
      const next = entries.map((e) => `${e.id}:${e.detections ?? 1}`).sort().join("|");
      if (next !== signature) {
        signature = next;
        props.onEntries(entries);
      }
      if (done) props.onSettled();
    };
    const schedule = (isIdle: boolean) => {
      settled = settled || isIdle;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    refreshEntries = () => schedule(true);
    instance.on("idle", () => schedule(true));
    instance.on("moveend", () => schedule(false));

    const start = featureBounds(areas);
    if (start) instance.fitBounds(start, { padding: 48, maxZoom: START_MAX_ZOOM, duration: 0 });

    const entryOf = (feature: TileFeature & { layer: { id: string } }, layer: Tab): Entry | null => {
      if (feature.layer.id !== "history") return toEntry(feature, layer, props.heads.counts);
      const point = props.history.find((p) => p.id === feature.properties.id);
      return point ? trackEntry(point) : null;
    };

    const popup = new Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, offset: 14, anchor: "bottom", maxWidth: "none" });
    let hoverId: string | null = null;
    const hide = () => {
      hoverId = null;
      instance.getCanvas().style.cursor = "";
      popup.remove();
    };
    instance.on("mousemove", (e) => {
      const layer = props.tab;
      const layers = [...sets[layer].layerIds(), "history"].filter((id) => instance.getLayer(id));
      if (!layers.length) return;
      const found = instance.queryRenderedFeatures(e.point, { layers })[0];
      if (!found) return hide();
      instance.getCanvas().style.cursor = "pointer";
      const tile = found as unknown as TileFeature;
      if (tile.properties.id === hoverId) return;
      const entry = entryOf(found as unknown as TileFeature & { layer: { id: string } }, layer);
      if (!entry) return hide();
      hoverId = tile.properties.id;
      popup.setLngLat(tile.geometry.coordinates as [number, number]).setDOMContent(entryCard(entry)).addTo(instance);
    });
    instance.on("mouseout", hide);
    instance.on("click", (e) => {
      const layer = props.tab;
      const layers = [...sets[layer].layerIds(), "history"].filter((id) => instance.getLayer(id));
      if (!layers.length) return;
      const feature = instance.queryRenderedFeatures(e.point, { layers })[0];
      if (!feature) return;
      const entry = entryOf(feature as unknown as TileFeature & { layer: { id: string } }, layer);
      if (!entry) return;
      if ((feature as unknown as { layer: { id: string } }).layer.id === "history") props.onPick(entry);
      else props.onSelect(entry);
    });

    let lastError = 0;
    let fellBack = false;
    instance.on("error", (e) => {
      const now = Date.now();
      const sourceId = (e as { sourceId?: string }).sourceId;
      for (const id of TABS) sets[id].fail(instance, sourceId);
      if (TABS.some((id) => sets[id].owns(sourceId)) || sourceId === "activity-focus") {
        if (now - lastError > ERROR_GAP_MS) props.onError("Could not load the map data. Check the connection and try again.");
        lastError = now;
      } else if (TOKEN && !fellBack && !instance.isStyleLoaded()) {
        fellBack = true;
        props.onError("Could not load the basemap. Showing a plain background.");
        instance.setStyle(FALLBACK_STYLE);
      }
    });

    setMap(instance);

    return () => {
      cancelAnimationFrame(frame);
      for (const marker of labels) marker.remove();
      popup.remove();
      instance.remove();
    };
  });

  createEffect(
    () => [map(), props.filter, props.heads] as const,
    ([current, filter, heads]) => {
      if (!current) return;
      for (const id of TABS) sets[id].restyle(current, filter, heads);
    },
  );

  createEffect(
    () => [map(), props.filter] as const,
    ([current]) => {
      if (!current?.getLayer(anchorId("pairs"))) return;
      for (const id of TABS) sets[id].sync(current, untrack(() => queryStyle(props, id)));
    },
  );

  createEffect(
    () => [map(), props.activityFocus] as const,
    ([current, activityFocus]) => {
      if (!current?.isStyleLoaded()) return;
      if (!activityFocus) {
        if (current.getLayer("activity-focus")) current.removeLayer("activity-focus");
        if (current.getSource("activity-focus")) current.removeSource("activity-focus");
        return;
      }
      const tiles = [activityTileUrl(window.location.origin, activityFocus.id)];
      const source = current.getSource("activity-focus") as { setTiles?: (tiles: string[]) => void } | undefined;
      if (source?.setTiles) source.setTiles(tiles);
      else {
        current.addSource("activity-focus", { type: "vector", tiles, minzoom: 0, maxzoom: MAX_TILE_ZOOM });
        current.addLayer(activityFocusLayer());
      }
    },
  );

  createEffect(
    () => [map(), props.track] as const,
    ([current, track]) => {
      (current?.getSource("track") as GeoJSONSource | undefined)?.setData(track);
    },
  );

  createEffect(
    () => [map(), props.history] as const,
    ([current, history]) => {
      (current?.getSource("history") as GeoJSONSource | undefined)?.setData(historyPoints(history));
    },
  );

  createEffect(
    () => [map(), props.pickedId] as const,
    ([current, pickedId]) => {
      if (!current?.getLayer("history")) return;
      current.setLayoutProperty("history", "icon-image", historyIconImage(pickedId));
      current.setLayoutProperty("history", "symbol-sort-key", historySortKey(pickedId));
    },
  );

  createEffect(
    () => [map(), props.tab] as const,
    ([current, tab]) => {
      if (!current) return;
      signature = "";
      for (const id of TABS) {
        for (const layerId of sets[id].allIds()) if (current.getLayer(layerId)) current.setLayoutProperty(layerId, "visibility", id === tab ? "visible" : "none");
      }
      if (current.getLayer(anchorId("pairs"))) for (const id of TABS) sets[id].sync(current, untrack(() => queryStyle(props, id)));
    },
  );

  createEffect(
    () => [map(), props.order, props.selectedId, props.tab] as const,
    ([current, order, selectedId, tab]) => {
      if (!current) return;
      for (const id of TABS) {
        const picked = id === tab ? selectedId : null;
        for (const layerId of sets[id].allIds()) {
          if (!current.getLayer(layerId)) continue;
          current.setLayoutProperty(layerId, "icon-image", iconImage(picked, id));
          current.setLayoutProperty(layerId, "symbol-sort-key", sortKey(order, picked));
        }
      }
    },
  );

  return (
    <main class="map" data-tour="map">
      <div class="map-canvas" ref={(el) => (container = el)} />
      <Legend tab={props.tab} />
      {props.children}
    </main>
  );
}
