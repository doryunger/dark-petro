import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import Details from "./components/Details";
import Filters, { type FiltersHandle } from "./components/Filters";
import Header from "./components/Header";
import MapView, { type MapHandle } from "./components/MapView";
import Reel, { type ReelHandle } from "./components/Reel";
import Toast from "./components/Toast";
import Tour from "./components/Tour";
import { fetchActivities, fetchActivityImos, fetchHotSpots, fetchMetadata, fetchSanctionedIndex, fetchTrack } from "./lib/api";
import { addDays, defaultFilter, extendToToday, todayUtc } from "./lib/dates";
import { entryTitle, pinFirst, setHotSpotLabels, sortEntries } from "./lib/entries";
import { shouldStartTour } from "./lib/tourSeen";
import { matches } from "./lib/filters";
import { NO_HEADS, latestPerVessel } from "./lib/heads";
import { historyOf, imoOf, trackEntry } from "./lib/groups";
import { trackLine } from "./lib/track";
import type { ActivityMatch, Entry, Filter, HotSpotCollection, Meta, Order, SanctionedDetection, Tab, TrackPoint } from "./lib/types";

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

const TOUR_ENABLED = import.meta.env.DEV || import.meta.env.VITE_TOUR === "1";
const TOUR_WANTED = TOUR_ENABLED && shouldStartTour(window.location.search);

const NO_HOT_SPOTS: HotSpotCollection = { type: "FeatureCollection", features: [] };

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
  const [meta, setMeta] = createSignal<Meta | null>(null);
  const [filter, setFilter] = createSignal<Filter | null>(null);
  const [hotSpots, setHotSpots] = createSignal<HotSpotCollection | null>(null);
  const [tab, setTab] = createSignal<Tab>("pairs");
  const [order, setOrder] = createSignal<Order>("latest");
  const [viewEntries, setViewEntries] = createSignal<Entry[]>([]);
  const [selection, setSelection] = createSignal<Selection>(NOTHING);
  const [track, setTrack] = createSignal<TrackData | null>(null);
  const [activityData, setActivityData] = createSignal<{ imo: string; from: string; to: string; matches: ActivityMatch[] } | null>(null);
  const [activityImoData, setActivityImoData] = createSignal<{ from: string; to: string; imos: string[] } | null>(null);
  const [sanctionedIndex, setSanctionedIndex] = createSignal<SanctionedDetection[] | null>(null);
  const [toast, setToast] = createSignal<string | null>(null);
  const [settled, setSettled] = createSignal(true);
  let mapHandle: MapHandle | undefined;
  let reelHandle: ReelHandle | undefined;
  let filtersHandle: FiltersHandle | undefined;
  let vesselOpenRequest = 0;

  const selected = createMemo(() => selection().entry);
  const savedVessel = createMemo(() => (selected()?.tab === "pairs" && selection().back?.entry?.tab === "sanctioned" ? selection().back : null));
  const reelEntry = createMemo(() => savedVessel()?.entry ?? selected());
  const reelParent = createMemo(() => savedVessel()?.parent ?? selection().parent);

  onSettled(() => {
    let alive = true;
    fetchMetadata()
      .then((m) => {
        if (!alive) return;
        const next = extendToToday(m, todayUtc());
        setMeta(next);
        setFilter(defaultFilter(todayUtc(), next.sources));
      })
      .catch(() => {
        if (!alive) return;
        const next = fallbackMeta();
        setToast("Could not load the data range. Check the connection and reload.");
        setMeta(next);
        setFilter(defaultFilter(todayUtc(), next.sources));
      });
    return () => {
      alive = false;
    };
  });

  onSettled(() => {
    let alive = true;
    fetchHotSpots()
      .then((collection) => {
        if (!alive) return;
        setHotSpotLabels(collection);
        setHotSpots(collection);
      })
      .catch(() => {
        if (!alive) return;
        setToast("Could not load the hot-spot areas. Check the connection and reload.");
        setHotSpots(NO_HOT_SPOTS);
      });
    return () => {
      alive = false;
    };
  });

  onSettled(() => {
    const controller = new AbortController();
    fetchSanctionedIndex(controller.signal)
      .then(setSanctionedIndex)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setToast("Could not load the sanctioned vessels. Check the connection and reload.");
      });
    return () => controller.abort();
  });

  const heads = createMemo(() => {
    const index = sanctionedIndex();
    const current = filter();
    return index && current ? latestPerVessel(index, current) : NO_HEADS;
  });

  const openImo = createMemo(() => {
    const parent = reelParent();
    return parent ? imoOf(parent) : null;
  });
  const activityOwner = createMemo(() => (selected()?.tab === "sanctioned" ? selected() : (savedVessel()?.entry ?? null)));
  const activityImo = createMemo(() => {
    const owner = activityOwner();
    return owner ? imoOf(owner) : null;
  });
  const activityFrom = createMemo(() => filter()?.from);
  const activityTo = createMemo(() => filter()?.to);
  const activityFilter = createMemo(() => {
    const from = activityFrom();
    const to = activityTo();
    return from && to ? { from, to, sources: [] } : null;
  });
  const trackIsCurrent = createMemo(() => {
    const data = track();
    const current = filter();
    return Boolean(data && current && data.imo === openImo() && data.from === current.from && data.to === current.to && data.sources.join(",") === [...current.sources].sort().join(","));
  });

  createEffect(
    () => activityFilter(),
    (range) => {
      if (!range) return undefined;
      const controller = new AbortController();
      fetchActivityImos(range, controller.signal)
        .then((imos) => setActivityImoData({ from: range.from, to: range.to, imos }))
        .catch(() => undefined);
      return () => controller.abort();
    },
  );

  createEffect(
    () => [openImo(), filter(), trackIsCurrent()] as const,
    ([imo, current, isCurrent]) => {
      if (!imo || !current || isCurrent) return undefined;
      const controller = new AbortController();
      fetchTrack(imo, current, controller.signal)
        .then((points) => setTrack({ imo, from: current.from, to: current.to, sources: [...current.sources].sort(), points }))
        .catch(() => undefined);
      return () => controller.abort();
    },
  );

  createEffect(
    () => [activityImo(), activityFilter()] as const,
    ([imo, range]) => {
      if (!imo || !range) return undefined;
      const controller = new AbortController();
      fetchActivities(imo, range, controller.signal)
        .then((activityMatches) => setActivityData({ imo, from: range.from, to: range.to, matches: activityMatches }))
        .catch(() => undefined);
      return () => controller.abort();
    },
  );

  const points = createMemo(() => {
    const data = track();
    return trackIsCurrent() && data ? data.points : [];
  });
  const line = createMemo(() => trackLine(points()));
  const others = createMemo(() => points().filter((p) => p.id !== reelParent()?.id));
  const history = createMemo(() => {
    const parent = reelParent();
    return parent ? historyOf(points(), parent.id) : [];
  });
  const activityMatches = createMemo(() => {
    const data = activityData();
    const range = activityFilter();
    return data && activityImo() && range && data.imo === activityImo() && data.from === range.from && data.to === range.to ? data.matches : [];
  });
  const activityImos = createMemo(() => {
    const data = activityImoData();
    const range = activityFilter();
    return new Set(data && range && data.from === range.from && data.to === range.to ? data.imos : []);
  });

  const cardEntry = createMemo(() => reelParent() ?? reelEntry());
  const cardId = createMemo(() => cardEntry()?.id ?? null);
  const cardMissing = createMemo(() => {
    const card = cardEntry();
    return Boolean(card && !viewEntries().some((e) => e.id === card.id));
  });
  const pinnedId = createMemo(() => (cardMissing() && settled() ? cardId() : null));

  const entries = createMemo(() => {
    const card = cardEntry();
    const shown = card && cardMissing() ? [...viewEntries(), card] : viewEntries();
    const related = activityImos();
    const decorated = shown.map((entry) => {
      if (entry.tab !== "sanctioned") return entry;
      const imo = entry.vessels[0]?.imo;
      return { ...entry, hasRelatedActivity: Boolean(imo && related.has(imo)) };
    });
    return pinFirst(sortEntries(decorated, order()), pinnedId());
  });

  const pickedId = createMemo(() => {
    const parent = reelParent();
    const entry = reelEntry();
    return parent && entry && entry.id !== parent.id ? entry.id : null;
  });
  const activityFocus = createMemo(() => (selection().activity ? selection().entry : null));
  const hasView = createMemo(() => (filter() && hotSpots() ? hotSpots() : null));

  const select = (entry: Entry, fromMap: boolean) => {
    vesselOpenRequest += 1;
    const current = selection();
    setTab(entry.tab);
    if (!fromMap && current.parent?.id === entry.id && current.entry?.id === entry.id && viewEntries().some((e) => e.id === entry.id)) {
      setSelection({ entry, parent: null, activity: null, tab: entry.tab, back: null, backLabel: null });
      return;
    }
    setSelection({ entry, parent: (entry.detections ?? 1) > 1 ? entry : null, activity: null, tab: entry.tab, back: null, backLabel: null });
    setSettled(!mapHandle?.flyTo(entry, !viewEntries().some((e) => e.id === entry.id)));
    if (fromMap) requestAnimationFrame(() => reelHandle?.reveal(entry.id));
  };

  const pick = (entry: Entry) => {
    vesselOpenRequest += 1;
    setTab(entry.tab);
    const selectionNow = selection();
    const nestedFromVessel = selectionNow.entry?.tab === "pairs" && selectionNow.back?.entry?.tab === "sanctioned";
    const current = nestedFromVessel ? (selectionNow.back?.entry ?? selectionNow.entry) : selectionNow.entry;
    const head = nestedFromVessel ? (selectionNow.back?.parent ?? selectionNow.parent) : selectionNow.parent;
    if (head && current?.id === entry.id && entry.id !== head.id) {
      setSelection({ entry: head, parent: head, activity: null, tab: entry.tab, back: null, backLabel: null });
      setSettled(!mapHandle?.flyTo(head, !viewEntries().some((e) => e.id === head.id)));
      return;
    }
    const previous = nestedFromVessel ? selectionView(selectionNow) : selectionNow.back;
    setSelection({ entry, parent: head, activity: null, tab: entry.tab, back: previous, backLabel: backLabel(previous) });
    setSettled(!mapHandle?.flyTo(entry, true));
  };

  const openActivity = (match: ActivityMatch) => {
    vesselOpenRequest += 1;
    const current = selection();
    if (current.entry?.tab !== "sanctioned") return;
    const previous = selectionView(current);
    setSelection({ entry: match.entry, parent: null, activity: match, tab: current.tab, back: previous, backLabel: backLabel(previous) });
    setSettled(!mapHandle?.flyTo(match.entry));
  };

  const openSanctionedVessel = async (imo: string) => {
    const current = selection();
    const currentFilter = filter();
    if (current.entry?.tab !== "pairs" || !currentFilter) return;
    const request = ++vesselOpenRequest;
    const controller = new AbortController();
    try {
      const data = track();
      const currentTrack = trackIsCurrent() && data?.imo === imo ? data : null;
      const found = currentTrack ? currentTrack.points : await fetchTrack(imo, currentFilter, controller.signal);
      if (request !== vesselOpenRequest || selection().entry?.id !== current.entry.id) return;
      if (!found.length) {
        setToast("No matching vessel detections in the selected filters.");
        return;
      }
      const vesselEntry = { ...trackEntry(found[0]), detections: found.length };
      setTrack({ imo, from: currentFilter.from, to: currentFilter.to, sources: [...currentFilter.sources].sort(), points: found });
      setViewEntries([]);
      setTab("sanctioned");
      const previous = selectionView(current);
      setSelection({ entry: vesselEntry, parent: vesselEntry, activity: null, tab: "sanctioned", back: previous, backLabel: backLabel(previous) });
      mapHandle?.flyTo(vesselEntry);
      setSettled(false);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setToast("Could not load this vessel's history. Check the connection and try again.");
    }
  };

  const goBack = () => {
    vesselOpenRequest += 1;
    const current = selection();
    const previous = current.back;
    if (!previous?.entry) return;
    setSelection({ ...previous, back: null, backLabel: null });
    if (previous.tab !== current.tab) setViewEntries([]);
    setTab(previous.tab);
    const flew = mapHandle?.flyTo(previous.entry);
    setSettled(previous.tab === current.tab ? !flew : false);
  };

  const apply = (next: Filter) => {
    vesselOpenRequest += 1;
    setFilter(next);
    setSelection((current) => {
      const valid = (view: SelectionView): boolean => {
        const entryMatches = !view.entry || (view.activity ? view.entry.date >= next.from && view.entry.date <= next.to : matches(view.entry, next));
        return entryMatches && (!view.parent || matches(view.parent, next));
      };
      return valid(current) && (!current.back || valid(current.back)) ? current : NOTHING;
    });
  };

  const changeTab = (next: Tab) => {
    vesselOpenRequest += 1;
    setTab(next);
    setSelection(NOTHING);
    setViewEntries([]);
    setSettled(true);
  };

  return (
    <>
      <Header />
      <Show when={meta() && filter()} fallback={<section class="filters" />}>
        <Filters
          ref={(handle) => {
            filtersHandle = handle;
          }}
          meta={meta() as Meta}
          applied={filter() as Filter}
          onApply={apply}
        />
      </Show>
      <Reel
        ref={(handle) => {
          reelHandle = handle;
        }}
        tab={tab()}
        onTab={changeTab}
        entries={entries()}
        selectedId={cardId()}
        pinnedId={pinnedId()}
        openId={reelParent()?.id ?? null}
        history={history()}
        pickedId={pickedId()}
        onPick={pick}
        order={order()}
        onOrder={setOrder}
        onSelect={(entry) => select(entry, false)}
      />
      <Details
        entry={selected()}
        onClose={() => {
          vesselOpenRequest += 1;
          setSelection(NOTHING);
        }}
        activityMatches={selected()?.tab === "sanctioned" ? activityMatches() : []}
        headerBackLabel={selection().backLabel}
        onOpenActivity={openActivity}
        onOpenSanctionedVessel={openSanctionedVessel}
        onBack={goBack}
      />
      <Show when={TOUR_WANTED && hasView()}>
        <Tour map={() => mapHandle} filter={filter() as Filter} meta={meta()} onFilter={apply} onSlide={(span) => filtersHandle?.slide(span)} hotSpots={hotSpots() as HotSpotCollection} entries={viewEntries()} onSelect={(entry) => select(entry, true)} onTab={changeTab} />
      </Show>
      <Show when={hasView()} fallback={<main class="map" />}>
        <MapView
          ref={(handle) => {
            mapHandle = handle;
          }}
          hotSpots={hotSpots() as HotSpotCollection}
          tab={tab()}
          track={line()}
          history={others()}
          activityFocus={activityFocus()}
          pickedId={pickedId()}
          onPick={pick}
          filter={filter() as Filter}
          heads={heads()}
          order={order()}
          selectedId={cardId()}
          onSelect={(entry) => select(entry, true)}
          onEntries={setViewEntries}
          onError={setToast}
          onSettled={() => setSettled(true)}
        >
          <Toast message={toast()} onClose={() => setToast(null)} />
        </MapView>
      </Show>
    </>
  );
}
