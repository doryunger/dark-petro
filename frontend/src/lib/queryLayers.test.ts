import type { Map as MapboxMap } from "mapbox-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWAP_TIMEOUT_MS } from "./constants";
import { type QueryStyle, TabQuery, queryKey } from "./queryLayers";

type Listener = (event: { sourceId?: string; sourceDataType?: string }) => void;

function fakeMap() {
  const sources = new Map<string, { tiles?: string[] }>();
  const layers: { id: string; filter?: unknown; before?: string }[] = [];
  const calls: string[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const loaded = new Set<string>();
  const map = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    addSource: (id: string, spec: { tiles?: string[] }) => {
      sources.set(id, spec);
      calls.push(`addSource ${id}`);
    },
    addLayer: (spec: { id: string; filter?: unknown }, before?: string) => {
      layers.push({ id: spec.id, filter: spec.filter, before });
      calls.push(`addLayer ${spec.id}`);
    },
    removeLayer: (id: string) => {
      layers.splice(layers.findIndex((layer) => layer.id === id), 1);
      calls.push(`removeLayer ${id}`);
    },
    removeSource: (id: string) => {
      sources.delete(id);
      calls.push(`removeSource ${id}`);
    },
    setFilter: (id: string, filter: unknown) => {
      const layer = layers.find((l) => l.id === id);
      if (layer) layer.filter = filter;
      calls.push(`setFilter ${id}`);
    },
    on: (name: string, fn: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(fn);
    },
    off: (name: string, fn: Listener) => listeners.get(name)?.delete(fn),
    isSourceLoaded: (id: string) => loaded.has(id),
  };
  const emit = (name: string, event: { sourceId?: string; sourceDataType?: string } = {}) => {
    for (const fn of [...(listeners.get(name) ?? [])]) fn(event);
  };
  const tilesLoaded = (id: string) => {
    loaded.add(id);
    emit("sourcedata", { sourceId: id, sourceDataType: "content" });
  };
  return { map: map as unknown as MapboxMap, sources, layers, calls, emit, tilesLoaded, taken: () => calls.splice(0), listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0) };
}

const day = (from: string, to: string, sources = ["s1", "s2"]) => ({ from, to, sources });
const style = (filter = day("2026-11-10", "2026-11-16"), over: Partial<QueryStyle> = {}): QueryStyle => ({ order: "latest", selectedId: null, active: true, filter, heads: { ids: [], counts: {} }, ...over });
const urls = (f: ReturnType<typeof fakeMap>) => [...f.sources.values()].map((s) => s.tiles?.[0]?.split("?")[1]);

let swaps = 0;
const query = (tab: "pairs" | "sanctioned" = "pairs") => new TabQuery(tab, "https://x.test", () => {
  swaps += 1;
});

beforeEach(() => {
  swaps = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("query layers", () => {
  it("shows the first query at once, as one source with the whole query in its tile url", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style(day("2026-11-10", "2026-11-16", ["s2", "s1"])));
    expect(urls(f)).toEqual(["from=2026-11-10&to=2026-11-16&source=s1,s2"]);
    expect(f.layers.map((l) => [l.id, l.before])).toEqual([["pairs:0", "pairs-top"]]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
    expect(swaps).toBe(1);
  });

  it("does nothing when the query has not changed", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    f.taken();
    q.sync(f.map, style());
    expect(f.taken()).toEqual([]);
  });

  it("puts a new query on top of the old one and keeps the old one on show until the new tiles have loaded and the map is idle", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    f.taken();
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    expect(f.taken()).toEqual(["addSource pairs:1", "addLayer pairs:1"]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
    expect(q.allIds()).toEqual(["pairs:0", "pairs:1"]);
    f.emit("idle");
    expect(f.taken()).toEqual([]);
    f.tilesLoaded("pairs:1");
    expect(f.taken()).toEqual([]);
    f.emit("idle");
    expect(f.taken()).toEqual(["removeLayer pairs:0", "removeSource pairs:0"]);
    expect(q.layerIds()).toEqual(["pairs:1"]);
    expect(swaps).toBe(2);
    expect(f.listenerCount()).toBe(0);
  });

  it("does not swap on tiles of another source or on the metadata event", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    f.taken();
    f.emit("sourcedata", { sourceId: "pairs:1", sourceDataType: "metadata" });
    f.emit("sourcedata", { sourceId: "pairs:0", sourceDataType: "content" });
    f.emit("idle");
    expect(f.taken()).toEqual([]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
  });

  it("drops a half-loaded query when the query changes again, and leaves the old one up", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    f.taken();
    q.sync(f.map, style(day("2026-11-05", "2026-11-12")));
    expect(f.taken()).toEqual(["removeLayer pairs:1", "removeSource pairs:1", "addSource pairs:2", "addLayer pairs:2"]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
    f.tilesLoaded("pairs:2");
    f.emit("idle");
    expect(q.layerIds()).toEqual(["pairs:2"]);
    expect(f.layers.map((l) => l.id)).toEqual(["pairs:2"]);
    expect(f.listenerCount()).toBe(0);
  });

  it("goes back to the shown query without any change when the range returns to it before the swap", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    f.taken();
    q.sync(f.map, style());
    expect(f.taken()).toEqual(["removeLayer pairs:1", "removeSource pairs:1"]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
    expect(f.listenerCount()).toBe(0);
  });

  it("keeps the old query when the new tiles fail or take too long", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    q.fail(f.map, "pairs:1");
    expect(q.allIds()).toEqual(["pairs:0"]);
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    f.taken();
    vi.advanceTimersByTime(SWAP_TIMEOUT_MS + 1);
    expect(f.taken()).toEqual(["removeLayer pairs:2", "removeSource pairs:2"]);
    expect(q.layerIds()).toEqual(["pairs:0"]);
  });

  it("swaps at once for a tab that is not shown, because it loads no tiles", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    f.taken();
    q.sync(f.map, style(day("2026-11-03", "2026-11-16"), { active: false }));
    expect(f.taken()).toEqual(["addSource pairs:1", "addLayer pairs:1", "removeLayer pairs:0", "removeSource pairs:0"]);
    expect(q.layerIds()).toEqual(["pairs:1"]);
  });

  it("swaps at once when the tab is hidden while its swap is waiting", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    q.sync(f.map, style(day("2026-11-03", "2026-11-16")));
    f.taken();
    q.sync(f.map, style(day("2026-11-03", "2026-11-16"), { active: false }));
    expect(f.taken()).toEqual(["removeLayer pairs:0", "removeSource pairs:0"]);
    expect(q.layerIds()).toEqual(["pairs:1"]);
  });

  it("gives a sanctioned query its heads when it is created and leaves the shown query's heads alone until the swap", () => {
    const f = fakeMap();
    const q = query("sanctioned");
    const first = day("2026-11-10", "2026-11-16");
    const second = day("2026-11-03", "2026-11-16");
    q.sync(f.map, style(first, { heads: { ids: ["a", "b"], counts: {} } }));
    q.sync(f.map, style(second, { heads: { ids: ["a", "c"], counts: {} } }));
    q.restyle(f.map, second, { ids: ["a", "c"], counts: {} });
    expect(f.layers.map((l) => l.filter)).toEqual([["in", ["get", "id"], ["literal", ["a", "b"]]], ["in", ["get", "id"], ["literal", ["a", "c"]]]]);
    expect(f.calls.some((c) => c.startsWith("setFilter"))).toBe(false);
  });

  it("updates the heads of the query on show when they arrive late, and never on a pairs layer", () => {
    const f = fakeMap();
    const sanctioned = query("sanctioned");
    const pairs = query("pairs");
    const range = day("2026-11-10", "2026-11-16");
    sanctioned.sync(f.map, style(range));
    pairs.sync(f.map, style(range));
    f.taken();
    const heads = { ids: ["a"], counts: { a: 1 } };
    sanctioned.restyle(f.map, range, heads);
    pairs.restyle(f.map, range, heads);
    sanctioned.restyle(f.map, range, heads);
    expect(f.taken()).toEqual(["setFilter sanctioned:0"]);
  });

  it("puts the layers back when the style is reloaded", () => {
    const f = fakeMap();
    const q = query();
    q.sync(f.map, style());
    f.sources.clear();
    f.layers.length = 0;
    q.sync(f.map, style());
    expect(f.layers.map((l) => l.id)).toEqual(["pairs:0"]);
    expect(f.sources.size).toBe(1);
  });

  it("treats the order of the sources as no change", () => {
    expect(queryKey(day("2026-11-10", "2026-11-16", ["s2", "s1"]))).toBe(queryKey(day("2026-11-10", "2026-11-16", ["s1", "s2"])));
  });
});
