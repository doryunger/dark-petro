import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details";
import Filters from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import { fetchMetadata, fetchTrack } from "./lib/api";
import { addDays, defaultFilter, extendToToday, todayUtc } from "./lib/dates";
import { sortEntries } from "./lib/entries";
import { matches } from "./lib/filters";
import { historyOf, imoOf } from "./lib/groups";
import { trackLine } from "./lib/track";
import type { Entry, Filter, Meta, Order, Tab, TrackPoint } from "./lib/types";

interface Selection {
  entry: Entry | null;
  parent: Entry | null;
}

const NOTHING: Selection = { entry: null, parent: null };

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
  const [selection, setSelection] = useState<Selection>(NOTHING);
  const [track, setTrack] = useState<{ imo: string; points: TrackPoint[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settled, setSettled] = useState(true);
  const mapRef = useRef<MapHandle>(null);
  const reelRef = useRef<ReelHandle>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const viewRef = useRef(viewEntries);
  viewRef.current = viewEntries;
  const { entry: selected, parent } = selection;

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
    if (!selected || !settled) return;
    const picked = parent !== null && selected.id !== parent.id;
    if (picked || viewEntries.some((e) => e.id === selected.id)) return;
    setSelection(NOTHING);
  }, [viewEntries, selected, parent, settled]);

  const openImo = parent ? imoOf(parent) : null;

  useEffect(() => {
    if (!openImo || !filter) {
      setTrack(null);
      return undefined;
    }
    const controller = new AbortController();
    fetchTrack(openImo, filter, controller.signal)
      .then((points) => setTrack({ imo: openImo, points }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [openImo, filter]);

  const points = useMemo(() => (track && track.imo === openImo ? track.points : []), [track, openImo]);
  const line = useMemo(() => trackLine(points), [points]);
  const others = useMemo(() => points.filter((p) => p.id !== parent?.id), [points, parent]);
  const history = useMemo(() => (parent ? historyOf(points, parent.id) : []), [points, parent]);

  const entries = useMemo(() => {
    const shown = parent && !viewEntries.some((e) => e.id === parent.id) ? [...viewEntries, parent] : viewEntries;
    return sortEntries(shown, order);
  }, [viewEntries, parent, order]);

  const pickedId = parent && selected && selected.id !== parent.id ? selected.id : null;
  const cardId = parent?.id ?? selected?.id ?? null;

  const select = useCallback((entry: Entry, fromMap: boolean) => {
    const current = selectionRef.current;
    if (!fromMap && current.parent?.id === entry.id && current.entry?.id === entry.id) {
      setSelection({ entry, parent: null });
      return;
    }
    setSelection({ entry, parent: (entry.detections ?? 1) > 1 ? entry : null });
    setSettled(!mapRef.current?.flyTo(entry, !viewRef.current.some((e) => e.id === entry.id)));
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const pick = useCallback((entry: Entry) => {
    const { entry: current, parent: head } = selectionRef.current;
    if (head && current?.id === entry.id && entry.id !== head.id) {
      setSelection({ entry: head, parent: head });
      setSettled(!mapRef.current?.flyTo(head, !viewRef.current.some((e) => e.id === head.id)));
      return;
    }
    setSelection((state) => ({ ...state, entry }));
    setSettled(!mapRef.current?.flyTo(entry, true));
  }, []);

  const apply = useCallback((next: Filter) => {
    setFilter(next);
    setSelection((current) => ((current.entry && !matches(current.entry, next)) || (current.parent && !matches(current.parent, next)) ? NOTHING : current));
  }, []);

  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    setSelection(NOTHING);
    setViewEntries([]);
    setSettled(true);
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <Header />
      {meta && filter ? <Filters meta={meta} applied={filter} onApply={apply} /> : <section className="filters" />}
      <Reel
        ref={reelRef}
        tab={tab}
        onTab={changeTab}
        entries={entries}
        selectedId={cardId}
        openId={parent?.id ?? null}
        history={history}
        pickedId={pickedId}
        onPick={pick}
        order={order}
        onOrder={setOrder}
        onSelect={(entry) => select(entry, false)}
      />
      <Details entry={selected} onClose={() => setSelection(NOTHING)} />
      {filter ? (
        <MapView
          ref={mapRef}
          tab={tab}
          track={line}
          history={others}
          pickedId={pickedId}
          onPick={pick}
          filter={filter}
          order={order}
          selectedId={cardId}
          onSelect={(entry) => select(entry, true)}
          onEntries={setViewEntries}
          onError={setToast}
          onSettled={() => setSettled(true)}
        >
          <Toast message={toast} onClose={closeToast} />
        </MapView>
      ) : (
        <main className="map" />
      )}
    </>
  );
}
