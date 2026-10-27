import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details";
import Filters from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import { fetchActivities, fetchActivityImos, fetchMetadata, fetchTrack } from "./lib/api";
import { addDays, defaultFilter, extendToToday, todayUtc } from "./lib/dates";
import { sortEntries } from "./lib/entries";
import { matches } from "./lib/filters";
import { historyOf, imoOf } from "./lib/groups";
import { trackLine } from "./lib/track";
import type { ActivityMatch, Entry, Filter, Meta, Order, Tab, TrackPoint } from "./lib/types";

interface SavedSelection {
  entry: Entry;
  parent: Entry | null;
}

interface Selection {
  entry: Entry | null;
  parent: Entry | null;
  activity: ActivityMatch | null;
  returnSelection: SavedSelection | null;
}

const NOTHING: Selection = { entry: null, parent: null, activity: null, returnSelection: null };

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
  const [activityData, setActivityData] = useState<{ imo: string; from: string; to: string; matches: ActivityMatch[] } | null>(null);
  const [activityImoData, setActivityImoData] = useState<{ from: string; to: string; imos: string[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settled, setSettled] = useState(true);
  const mapRef = useRef<MapHandle>(null);
  const reelRef = useRef<ReelHandle>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const viewRef = useRef(viewEntries);
  viewRef.current = viewEntries;
  const { entry: selected, parent } = selection;
  const reelEntry = selection.returnSelection?.entry ?? selected;
  const reelParent = selection.returnSelection?.parent ?? parent;

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
    if (!selected || !settled || selection.returnSelection) return;
    const picked = parent !== null && selected.id !== parent.id;
    if (picked || viewEntries.some((e) => e.id === selected.id)) return;
    setSelection(NOTHING);
  }, [viewEntries, selected, parent, settled, selection.returnSelection]);

  const openImo = reelParent ? imoOf(reelParent) : null;
  const activityOwner = selection.returnSelection?.entry ?? selected;
  const activityImo = activityOwner ? imoOf(activityOwner) : null;
  const activityFilter = useMemo(() => filter ? { from: filter.from, to: filter.to, sources: [] } : null, [filter?.from, filter?.to]);

  useEffect(() => {
    if (!activityFilter) {
      setActivityImoData(null);
      return undefined;
    }
    const controller = new AbortController();
    fetchActivityImos(activityFilter, controller.signal)
      .then((imos) => setActivityImoData({ from: activityFilter.from, to: activityFilter.to, imos }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [activityFilter]);

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

  useEffect(() => {
    if (!activityImo || !activityFilter) {
      setActivityData(null);
      return undefined;
    }
    const controller = new AbortController();
    fetchActivities(activityImo, activityFilter, controller.signal)
      .then((activityMatches) => setActivityData({ imo: activityImo, from: activityFilter.from, to: activityFilter.to, matches: activityMatches }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [activityImo, activityFilter]);

  const points = useMemo(() => (track && track.imo === openImo ? track.points : []), [track, openImo]);
  const line = useMemo(() => trackLine(points), [points]);
  const others = useMemo(() => points.filter((p) => p.id !== reelParent?.id), [points, reelParent]);
  const history = useMemo(() => (reelParent ? historyOf(points, reelParent.id) : []), [points, reelParent]);
  const activityDataCurrent = Boolean(activityData && activityImo && activityFilter && activityData.imo === activityImo && activityData.from === activityFilter.from && activityData.to === activityFilter.to);
  const activityMatches = activityDataCurrent && activityData ? activityData.matches : [];
  const activityImosCurrent = Boolean(activityImoData && activityFilter && activityImoData.from === activityFilter.from && activityImoData.to === activityFilter.to);
  const activityImos = useMemo(() => new Set(activityImosCurrent && activityImoData ? activityImoData.imos : []), [activityImosCurrent, activityImoData]);

  const entries = useMemo(() => {
    const shown = reelParent && !viewEntries.some((e) => e.id === reelParent.id) ? [...viewEntries, reelParent] : viewEntries;
    const decorated = shown.map((entry) => {
      if (entry.tab !== "sanctioned") return entry;
      const imo = entry.vessels[0]?.imo;
      return { ...entry, hasRelatedActivity: Boolean(imo && activityImos.has(imo)) };
    });
    return sortEntries(decorated, order);
  }, [viewEntries, reelParent, activityImos, order]);

  const pickedId = reelParent && reelEntry && reelEntry.id !== reelParent.id ? reelEntry.id : null;
  const cardId = reelParent?.id ?? reelEntry?.id ?? null;

  const select = useCallback((entry: Entry, fromMap: boolean) => {
    const current = selectionRef.current;
    setTab(entry.tab);
    if (!fromMap && current.parent?.id === entry.id && current.entry?.id === entry.id) {
      setSelection({ entry, parent: null, activity: null, returnSelection: null });
      return;
    }
    setSelection({ entry, parent: (entry.detections ?? 1) > 1 ? entry : null, activity: null, returnSelection: null });
    setSettled(!mapRef.current?.flyTo(entry, !viewRef.current.some((e) => e.id === entry.id)));
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const pick = useCallback((entry: Entry) => {
    setTab(entry.tab);
    const selectionNow = selectionRef.current;
    const current = selectionNow.returnSelection?.entry ?? selectionNow.entry;
    const head = selectionNow.returnSelection?.parent ?? selectionNow.parent;
    if (head && current?.id === entry.id && entry.id !== head.id) {
      setSelection({ entry: head, parent: head, activity: null, returnSelection: null });
      setSettled(!mapRef.current?.flyTo(head, !viewRef.current.some((e) => e.id === head.id)));
      return;
    }
    setSelection({ entry, parent: head, activity: null, returnSelection: null });
    setSettled(!mapRef.current?.flyTo(entry, true));
  }, []);

  const openActivity = useCallback((match: ActivityMatch) => {
    if (!selected) return;
    setSelection({ entry: match.entry, parent: null, activity: match, returnSelection: { entry: selected, parent } });
    setSettled(!mapRef.current?.flyTo(match.entry));
  }, [selected, parent]);

  const returnToVessel = useCallback(() => {
    const saved = selectionRef.current.returnSelection;
    if (!saved) return;
    setSelection({ entry: saved.entry, parent: saved.parent, activity: null, returnSelection: null });
    mapRef.current?.flyTo(saved.entry);
    setSettled(false);
  }, []);

  const apply = useCallback((next: Filter) => {
    setFilter(next);
    setSelection((current) => {
      if (current.returnSelection) {
        const activityInRange = current.entry && current.entry.date >= next.from && current.entry.date <= next.to;
        const returnMatches = matches(current.returnSelection.entry, next) && (!current.returnSelection.parent || matches(current.returnSelection.parent, next));
        return activityInRange && returnMatches ? current : NOTHING;
      }
      return (current.entry && !matches(current.entry, next)) || (current.parent && !matches(current.parent, next)) ? NOTHING : current;
    });
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
        openId={reelParent?.id ?? null}
        history={history}
        pickedId={pickedId}
        onPick={pick}
        order={order}
        onOrder={setOrder}
        onSelect={(entry) => select(entry, false)}
      />
      <Details
        entry={selected}
        onClose={() => setSelection(NOTHING)}
        activityMatches={selected?.tab === "sanctioned" ? activityMatches : []}
        activityReturn={selection.returnSelection?.entry ?? null}
        onOpenActivity={openActivity}
        onReturnVessel={returnToVessel}
      />
      {filter ? (
        <MapView
          ref={mapRef}
          tab={tab}
          track={line}
          history={others}
          activityFocus={selection.activity ? selection.entry : null}
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
