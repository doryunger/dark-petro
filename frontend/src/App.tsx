import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./components/Details";
import Filters from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import { fetchActivities, fetchActivityImos, fetchMetadata, fetchTrack } from "./lib/api";
import { addDays, defaultFilter, extendToToday, todayUtc } from "./lib/dates";
import { entryTitle, sortEntries } from "./lib/entries";
import { matches } from "./lib/filters";
import { historyOf, imoOf, trackEntry } from "./lib/groups";
import { trackLine } from "./lib/track";
import type { ActivityMatch, Entry, Filter, Meta, Order, Tab, TrackPoint } from "./lib/types";

interface SelectionView {
  entry: Entry | null;
  parent: Entry | null;
  activity: ActivityMatch | null;
  tab: Tab;
}

interface Selection extends SelectionView {
  back: SelectionView | null;
  backLabel: string | null;
}

interface TrackData {
  imo: string;
  from: string;
  to: string;
  sources: string[];
  points: TrackPoint[];
}

const NOTHING: Selection = { entry: null, parent: null, activity: null, tab: "pairs", back: null, backLabel: null };

function selectionView(selection: Selection): SelectionView {
  return { entry: selection.entry, parent: selection.parent, activity: selection.activity, tab: selection.tab };
}

function backLabel(view: SelectionView | null): string | null {
  if (!view?.entry) return null;
  return view.entry.tab === "pairs" ? view.entry.shortId : entryTitle(view.entry);
}

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
  const [track, setTrack] = useState<TrackData | null>(null);
  const [activityData, setActivityData] = useState<{ imo: string; from: string; to: string; matches: ActivityMatch[] } | null>(null);
  const [activityImoData, setActivityImoData] = useState<{ from: string; to: string; imos: string[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settled, setSettled] = useState(true);
  const mapRef = useRef<MapHandle>(null);
  const reelRef = useRef<ReelHandle>(null);
  const vesselOpenRequest = useRef(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const viewRef = useRef(viewEntries);
  viewRef.current = viewEntries;
  const { entry: selected, parent } = selection;
  const savedVessel = selected?.tab === "pairs" && selection.back?.entry?.tab === "sanctioned" ? selection.back : null;
  const reelEntry = savedVessel?.entry ?? selected;
  const reelParent = savedVessel?.parent ?? parent;

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
    if (!selected || !settled || selection.back) return;
    const picked = parent !== null && selected.id !== parent.id;
    if (picked || viewEntries.some((e) => e.id === selected.id)) return;
    setSelection(NOTHING);
  }, [viewEntries, selected, parent, settled, selection.back]);

  const openImo = reelParent ? imoOf(reelParent) : null;
  const activityOwner = selected?.tab === "sanctioned" ? selected : savedVessel?.entry ?? null;
  const activityImo = activityOwner ? imoOf(activityOwner) : null;
  const activityFrom = filter?.from;
  const activityTo = filter?.to;
  const activityFilter = useMemo(() => activityFrom && activityTo ? { from: activityFrom, to: activityTo, sources: [] } : null, [activityFrom, activityTo]);
  const trackIsCurrent = Boolean(track && filter && track.imo === openImo && track.from === filter.from && track.to === filter.to && track.sources.join(",") === [...filter.sources].sort().join(","));

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
    if (trackIsCurrent) return undefined;
    const controller = new AbortController();
    fetchTrack(openImo, filter, controller.signal)
      .then((points) => setTrack({ imo: openImo, from: filter.from, to: filter.to, sources: [...filter.sources].sort(), points }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [openImo, filter, trackIsCurrent]);

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

  const points = useMemo(() => (trackIsCurrent && track ? track.points : []), [trackIsCurrent, track]);
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
    vesselOpenRequest.current += 1;
    const current = selectionRef.current;
    setTab(entry.tab);
    if (!fromMap && current.parent?.id === entry.id && current.entry?.id === entry.id) {
      setSelection({ entry, parent: null, activity: null, tab: entry.tab, back: null, backLabel: null });
      return;
    }
    setSelection({ entry, parent: (entry.detections ?? 1) > 1 ? entry : null, activity: null, tab: entry.tab, back: null, backLabel: null });
    setSettled(!mapRef.current?.flyTo(entry, !viewRef.current.some((e) => e.id === entry.id)));
    if (fromMap) requestAnimationFrame(() => reelRef.current?.reveal(entry.id));
  }, []);

  const pick = useCallback((entry: Entry) => {
    vesselOpenRequest.current += 1;
    setTab(entry.tab);
    const selectionNow = selectionRef.current;
    const nestedFromVessel = selectionNow.entry?.tab === "pairs" && selectionNow.back?.entry?.tab === "sanctioned";
    const current = nestedFromVessel ? selectionNow.back?.entry ?? selectionNow.entry : selectionNow.entry;
    const head = nestedFromVessel ? selectionNow.back?.parent ?? selectionNow.parent : selectionNow.parent;
    if (head && current?.id === entry.id && entry.id !== head.id) {
      setSelection({ entry: head, parent: head, activity: null, tab: entry.tab, back: null, backLabel: null });
      setSettled(!mapRef.current?.flyTo(head, !viewRef.current.some((e) => e.id === head.id)));
      return;
    }
    const previous = nestedFromVessel ? selectionView(selectionNow) : selectionNow.back;
    setSelection({ entry, parent: head, activity: null, tab: entry.tab, back: previous, backLabel: backLabel(previous) });
    setSettled(!mapRef.current?.flyTo(entry, true));
  }, []);

  const openActivity = useCallback((match: ActivityMatch) => {
    vesselOpenRequest.current += 1;
    const current = selectionRef.current;
    if (current.entry?.tab !== "sanctioned") return;
    const previous = selectionView(current);
    setSelection({ entry: match.entry, parent: null, activity: match, tab: current.tab, back: previous, backLabel: backLabel(previous) });
    setSettled(!mapRef.current?.flyTo(match.entry));
  }, []);

  const openSanctionedVessel = useCallback(async (imo: string) => {
    const current = selectionRef.current;
    if (current.entry?.tab !== "pairs" || !filter) return;
    const request = ++vesselOpenRequest.current;
    const controller = new AbortController();
    try {
      const currentTrack = trackIsCurrent && track?.imo === imo ? track : null;
      const points = currentTrack ? currentTrack.points : await fetchTrack(imo, filter, controller.signal);
      if (request !== vesselOpenRequest.current || selectionRef.current.entry?.id !== current.entry.id) return;
      if (!points.length) {
        setToast("No matching vessel detections in the selected filters.");
        return;
      }
      const vesselEntry = { ...trackEntry(points[0]), detections: points.length };
      setTrack({ imo, from: filter.from, to: filter.to, sources: [...filter.sources].sort(), points });
      setViewEntries([]);
      setTab("sanctioned");
      const previous = selectionView(current);
      setSelection({ entry: vesselEntry, parent: vesselEntry, activity: null, tab: "sanctioned", back: previous, backLabel: backLabel(previous) });
      setSettled(!mapRef.current?.flyTo(vesselEntry));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setToast("Could not load this vessel's history. Check the connection and try again.");
    }
  }, [filter, track, trackIsCurrent]);

  const goBack = useCallback(() => {
    vesselOpenRequest.current += 1;
    const current = selectionRef.current;
    const previous = current.back;
    if (!previous?.entry) return;
    setSelection({ ...previous, back: null, backLabel: null });
    if (previous.tab !== current.tab) setViewEntries([]);
    setTab(previous.tab);
    const flew = mapRef.current?.flyTo(previous.entry);
    setSettled(previous.tab === current.tab ? !flew : false);
  }, []);

  const apply = useCallback((next: Filter) => {
    vesselOpenRequest.current += 1;
    setFilter(next);
    setSelection((current) => {
      const valid = (view: SelectionView): boolean => {
        const entryMatches = !view.entry || (view.activity ? view.entry.date >= next.from && view.entry.date <= next.to : matches(view.entry, next));
        return entryMatches && (!view.parent || matches(view.parent, next));
      };
      return valid(current) && (!current.back || valid(current.back)) ? current : NOTHING;
    });
  }, []);

  const changeTab = useCallback((next: Tab) => {
    vesselOpenRequest.current += 1;
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
        onClose={() => {
          vesselOpenRequest.current += 1;
          setSelection(NOTHING);
        }}
        activityMatches={selected?.tab === "sanctioned" ? activityMatches : []}
        headerBackLabel={selection.backLabel}
        onOpenActivity={openActivity}
        onOpenSanctionedVessel={openSanctionedVessel}
        onBack={goBack}
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
