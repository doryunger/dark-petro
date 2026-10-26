import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details";
import Filters from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import { fetchMetadata } from "./lib/api";
import { addDays, defaultFilter, extendToToday, todayUtc } from "./lib/dates";
import { sortEntries } from "./lib/entries";
import { matches } from "./lib/filters";
import type { Entry, Filter, Meta, Order, Tab } from "./lib/types";

function fallbackMeta(): Meta {
  const today = todayUtc();
  return { min_date: addDays(today, -30), max_date: today, sources: ["s1", "s2"] };
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [tab, setTab] = useState<Tab>("pairs");
  const [order, setOrder] = useState<Order>("latest");
  const [viewEntries, setViewEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settled, setSettled] = useState(true);
  const mapRef = useRef<MapHandle>(null);
  const reelRef = useRef<ReelHandle>(null);

  useEffect(() => {
    let alive = true;
    fetchMetadata()
      .then((m) => alive && setMeta(extendToToday(m, todayUtc())))
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
    if (!selected || !settled || viewEntries.some((e) => e.id === selected.id)) return;
    setSelected(null);
  }, [viewEntries, selected, settled]);

  const entries = useMemo(() => sortEntries(viewEntries, order), [viewEntries, order]);

  const select = useCallback((entry: Entry, fromMap: boolean) => {
    setSelected(entry);
    setSettled(!mapRef.current?.flyTo(entry));
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const apply = useCallback((next: Filter) => {
    setFilter(next);
    setSelected((current) => (current && !matches(current, next) ? null : current));
  }, []);

  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    setSelected(null);
    setViewEntries([]);
    setSettled(true);
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <Header />
      {meta && filter ? <Filters meta={meta} applied={filter} onApply={apply} /> : <section className="filters" />}
      <Reel ref={reelRef} tab={tab} onTab={changeTab} entries={entries} selectedId={selected?.id ?? null} order={order} onOrder={setOrder} onSelect={(entry) => select(entry, false)} />
      <Details entry={selected} onClose={() => setSelected(null)} />
      {filter ? (
        <MapView ref={mapRef} tab={tab} filter={filter} order={order} selectedId={selected?.id ?? null} onSelect={(entry) => select(entry, true)} onEntries={setViewEntries} onError={setToast} onSettled={() => setSettled(true)}>
          <Toast message={toast} onClose={closeToast} />
        </MapView>
      ) : (
        <main className="map" />
      )}
    </>
  );
}
