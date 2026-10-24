import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details.jsx";
import Filters from "./components/Filters.jsx";
import Header from "./components/Header.jsx";
import MapView from "./components/MapView.jsx";
import Reel from "./components/Reel.jsx";
import Toast from "./components/Toast.jsx";
import { fetchMetadata } from "./lib/api.js";
import { addDays, defaultFilter, todayUtc } from "./lib/dates.js";
import { sortEntries } from "./lib/entries.js";
import { matches } from "./lib/filters.js";

function fallbackMeta() {
  const today = todayUtc();
  return { min_date: addDays(today, -30), max_date: today, sources: ["s1", "s2"] };
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [filter, setFilter] = useState(null);
  const [order, setOrder] = useState("latest");
  const [viewEntries, setViewEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const mapRef = useRef(null);
  const reelRef = useRef(null);

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

  const entries = useMemo(() => sortEntries(viewEntries, order), [viewEntries, order]);

  const select = useCallback((entry, fromMap) => {
    setSelected(entry);
    mapRef.current?.flyTo(entry);
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const apply = useCallback((next) => {
    setFilter(next);
    setSelected((current) => (current && !matches(current, next) ? null : current));
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <Header />
      {meta && filter ? <Filters meta={meta} applied={filter} onApply={apply} /> : <section className="filters" />}
      <Reel ref={reelRef} entries={entries} selectedId={selected?.id} order={order} onOrder={setOrder} onSelect={(entry) => select(entry, false)} />
      <Details entry={selected} onClose={() => setSelected(null)} />
      {filter ? (
        <MapView ref={mapRef} filter={filter} order={order} selectedId={selected?.id} onSelect={(entry) => select(entry, true)} onEntries={setViewEntries} onError={setToast}>
          <Toast message={toast} onClose={closeToast} />
        </MapView>
      ) : (
        <main className="map" />
      )}
    </>
  );
}
