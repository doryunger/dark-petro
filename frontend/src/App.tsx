import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details";
import Filters from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import { fetchMetadata } from "./lib/api";
import { SELECT_GRACE_MS } from "./lib/constants";
import { addDays, defaultFilter, todayUtc } from "./lib/dates";
import { sortEntries } from "./lib/entries";
import { matches } from "./lib/filters";
import type { Entry, Filter, Meta, Order } from "./lib/types";

function fallbackMeta(): Meta {
  const today = todayUtc();
  return { min_date: addDays(today, -30), max_date: today, sources: ["s1", "s2"] };
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [order, setOrder] = useState<Order>("latest");
  const [viewEntries, setViewEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const mapRef = useRef<MapHandle>(null);
  const reelRef = useRef<ReelHandle>(null);
  const selectedAt = useRef(0);

  useEffect(() => {
    let alive = true;
    fetchMetadata()
      .then((m) => alive && setMeta(m))
      .catch(() => {
        if (!alive) return;
        setToast("Could not load the data range. Check the connection and reload.");
        setMeta(fallbackMeta());
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (meta) setFilter(defaultFilter(todayUtc(), meta.sources));
  }, [meta]);

  useEffect(() => {
    if (!selected || viewEntries.some((e) => e.id === selected.id)) return undefined;
    const wait = Math.max(0, selectedAt.current + SELECT_GRACE_MS - Date.now());
    const timer = setTimeout(() => setSelected((current) => (current?.id === selected.id ? null : current)), wait);
    return () => clearTimeout(timer);
  }, [viewEntries, selected]);

  const entries = useMemo(() => sortEntries(viewEntries, order), [viewEntries, order]);

  const select = useCallback((entry: Entry, fromMap: boolean) => {
    selectedAt.current = Date.now();
    setSelected(entry);
    mapRef.current?.flyTo(entry);
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const apply = useCallback((next: Filter) => {
    setFilter(next);
    setSelected((current) => (current && !matches(current, next) ? null : current));
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <Header />
      {meta && filter ? <Filters meta={meta} applied={filter} onApply={apply} /> : <section className="filters" />}
      <Reel ref={reelRef} entries={entries} selectedId={selected?.id ?? null} order={order} onOrder={setOrder} onSelect={(entry) => select(entry, false)} />
      <Details entry={selected} onClose={() => setSelected(null)} />
      {filter ? (
        <MapView ref={mapRef} filter={filter} order={order} selectedId={selected?.id ?? null} onSelect={(entry) => select(entry, true)} onEntries={setViewEntries} onError={setToast}>
          <Toast message={toast} onClose={closeToast} />
        </MapView>
      ) : (
        <main className="map" />
      )}
    </>
  );
}
