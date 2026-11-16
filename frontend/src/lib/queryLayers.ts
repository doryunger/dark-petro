import type { Map as MapboxMap } from "mapbox-gl";
import { MAX_TILE_ZOOM, SWAP_TIMEOUT_MS } from "./constants";
import { tileUrl } from "./filters";
import type { Heads } from "./heads";
import { headsFilter, symbolLayer } from "./layers";
import type { Filter, Order, Tab } from "./types";

export interface QueryStyle {
  order: Order;
  selectedId: string | null;
  active: boolean;
  filter: Filter;
  heads: Heads;
}

interface Generation {
  id: string;
  key: string;
  filterKey: string;
}

export function anchorId(tab: Tab): string {
  return `${tab}-top`;
}

export function queryKey(filter: Filter): string {
  return `${filter.from}|${filter.to}|${[...filter.sources].sort().join(",")}`;
}

export class TabQuery {
  private active: Generation | null = null;
  private pending: Generation | null = null;
  private stop: (() => void) | null = null;
  private serial = 0;

  constructor(
    private readonly tab: Tab,
    private readonly origin: string,
    private readonly onSwap: () => void,
  ) {}

  layerIds(): string[] {
    return this.active ? [this.active.id] : [];
  }

  allIds(): string[] {
    return [this.active, this.pending].filter((generation): generation is Generation => generation !== null).map((generation) => generation.id);
  }

  owns(sourceId: string | undefined): boolean {
    return Boolean(sourceId) && this.allIds().includes(sourceId as string);
  }

  sync(map: MapboxMap, style: QueryStyle): void {
    const key = queryKey(style.filter);
    if (this.pending && this.pending.key !== key) this.cancel(map);
    const current = this.pending ?? this.active;
    if (current?.key === key) {
      this.ensure(map, style);
    } else {
      const next: Generation = { id: `${this.tab}:${this.serial++}`, key, filterKey: this.filterKeyOf(style.heads) };
      this.add(map, next, style);
      if (this.active && style.active) {
        this.pending = next;
        this.watch(map, next);
      } else {
        this.settle(map, next);
      }
    }
    if (this.pending && !style.active) this.settle(map, this.pending);
  }

  restyle(map: MapboxMap, filter: Filter, heads: Heads): void {
    if (this.tab !== "sanctioned") return;
    const key = queryKey(filter);
    const filterKey = this.filterKeyOf(heads);
    for (const generation of [this.active, this.pending]) {
      if (!generation || generation.key !== key || generation.filterKey === filterKey || !map.getLayer(generation.id)) continue;
      map.setFilter(generation.id, headsFilter(heads));
      generation.filterKey = filterKey;
    }
  }

  fail(map: MapboxMap, sourceId: string | undefined): void {
    if (this.pending && this.pending.id === sourceId) this.cancel(map);
  }

  private filterKeyOf(heads: Heads): string {
    return this.tab === "sanctioned" ? heads.ids.join(",") : "";
  }

  private add(map: MapboxMap, generation: Generation, style: QueryStyle): void {
    if (!map.getSource(generation.id)) {
      map.addSource(generation.id, { type: "vector", tiles: [tileUrl(this.origin, this.tab, queryOf(generation.key))], minzoom: 0, maxzoom: MAX_TILE_ZOOM });
    }
    if (!map.getLayer(generation.id)) {
      map.addLayer(symbolLayer(this.tab, { ...style, id: generation.id, source: generation.id }), anchorId(this.tab));
    }
  }

  private ensure(map: MapboxMap, style: QueryStyle): void {
    for (const generation of [this.active, this.pending]) if (generation) this.add(map, generation, style);
  }

  private remove(map: MapboxMap, generation: Generation): void {
    if (map.getLayer(generation.id)) map.removeLayer(generation.id);
    if (map.getSource(generation.id)) map.removeSource(generation.id);
  }

  private cancel(map: MapboxMap): void {
    this.stop?.();
    this.stop = null;
    if (this.pending) this.remove(map, this.pending);
    this.pending = null;
  }

  private settle(map: MapboxMap, next: Generation): void {
    this.stop?.();
    this.stop = null;
    const old = this.active;
    this.active = next;
    this.pending = null;
    if (old && old !== next) this.remove(map, old);
    this.onSwap();
  }

  private watch(map: MapboxMap, generation: Generation): void {
    let tiles = false;
    const onData = (event: { sourceId?: string; sourceDataType?: string }) => {
      if (event.sourceId === generation.id && event.sourceDataType === "content") tiles = true;
    };
    const onIdle = () => {
      if (tiles && map.isSourceLoaded(generation.id)) this.settle(map, generation);
    };
    const timer = setTimeout(() => this.cancel(map), SWAP_TIMEOUT_MS);
    map.on("sourcedata", onData);
    map.on("idle", onIdle);
    this.stop = () => {
      clearTimeout(timer);
      map.off("sourcedata", onData);
      map.off("idle", onIdle);
    };
  }
}

function queryOf(key: string): Filter {
  const [from, to, sources] = key.split("|");
  return { from, to, sources: sources ? sources.split(",") : [] };
}
