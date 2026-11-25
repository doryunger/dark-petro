import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { DEFAULT_RANGE_DAYS, START_MAX_ZOOM, TOUR_HOT_SPOT } from "../lib/constants";
import { addDays, dayIndex } from "../lib/dates";
import { featureBounds } from "../lib/geo";
import { minSide, padRect, placeCard, rectOfPoints, type Point, type Rect, type Size } from "../lib/tour";
import type { Entry, Filter, HotSpotCollection, HotSpotFeature, Meta, Tab } from "../lib/types";
import type { MapHandle } from "./MapView";

const START_DELAY_MS = 600;
const ENTRIES_WAIT_MS = 6000;
const POLL_MS = 200;
const HIGHLIGHT_PAD_PX = 8;
const MIN_HIGHLIGHT_PX = 56;
const PANEL_INSET_PX = 1;
const HIGHLIGHT_RADIUS_PX = 4;
const FIT_PADDING_PX = 150;
const RESET_PADDING_PX = 48;
const WIDER_RANGE_DAYS = 30;
const FIELD_PAD_PX = 6;
const SLIDE_DELAY_MS = 700;
const SLIDE_MS = 2000;
const FIELD_TARGETS: Target[] = ["time-range", "sources"];

type Target = "none" | "spots" | "reel" | "details" | "pair" | "filters" | "time-range" | "sources";

const MAP_TARGETS: Target[] = ["spots", "pair"];

type Text = string | (() => string);

interface Step {
  id: string;
  title: Text;
  body: Text;
  target: Target | Target[];
  next?: Text;
}


const read = (value: Text) => (typeof value === "function" ? value() : value);

const STEPS: Step[] = [
  {
    id: "intro",
    title: "Welcome to Dark Petro",
    body: "Dark Petro is a public map of suspected ship-to-ship (STS) oil transfers found in satellite imagery, and of sanctioned vessels seen at the same places. Two vessels meeting at sea to move cargo is a common way around sanctions.",
    target: "none",
  },
  {
    id: "spots",
    title: "Hot spots",
    body: "The outlined areas are hot spots, the stretches of sea where STS transfers are known to happen. Every detection belongs to one of them.",
    target: "spots",
    next: "Zoom in",
  },
  {
    id: "reel",
    title: "Detections",
    body: "Every detection in the current map view is listed here, with its hot spot, capture date and satellite. The list follows the map; sort it newest or oldest first.",
    target: "reel",
    next: "Select a detection",
  },
  {
    id: "details",
    title: "A selected detection",
    body: "It shows its satellite capture, the time, and each vessel's name, flag and IMO number, with a Sanctioned badge when it is listed. On the map it is ringed in cyan: two vessels side by side, yellow, or red when one is sanctioned.",
    target: ["details", "pair"],
  },
  {
    id: "sanctioned",
    title: "Sanctioned vessels",
    body: "This tab lists single vessels whose IMO number is on a sanctions list, such as the US (OFAC), EU and UK lists. Every time one is seen in a hot spot it is recorded, so its behaviour can be followed, including whether it takes part in suspicious activity.",
    target: "reel",
    next: "Select a vessel",
  },
  {
    id: "vessels",
    title: "A sanctioned vessel",
    body: "Selecting a vessel opens its capture and every position recorded for it in the time range. On the map it is shown in cyan.",
    target: ["details", "pair"],
  },
  {
    id: "filters",
    title: "Filters",
    body: "Filters narrow what the map and the list show, and both update together.",
    target: "filters",
  },
  {
    id: "time-range",
    title: "Time range",
    body: `Time range keeps only the detections captured between the two dates, the last ${DEFAULT_RANGE_DAYS} days to begin with. Changing it reloads the map and the list.`,
    target: "time-range",
    next: "Change the time range",
  },
  {
    id: "sources",
    title: "Sources",
    body: "Each detection comes from one of two satellites: Sentinel-1, a radar that sees through cloud and at night, or Sentinel-2, an optical camera that works in daylight.",
    target: "sources",
  },
  {
    id: "done",
    title: "That is the tour",
    body: "Select any detection or sanctioned vessel, or change the filters, to explore the map on your own.",
    target: "none",
    next: "Done",
  },
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function domRect(id: string): Rect | null {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom };
}

function viewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

function labelRect(label: string): Rect | null {
  const el = Array.from(document.querySelectorAll(".hot-spot-label")).find((node) => node.textContent === label);
  if (!el) return null;
  const { left, top, right, bottom } = el.getBoundingClientRect();
  return { left, top, right, bottom };
}

function featureRect(map: MapHandle, feature: HotSpotFeature): Rect | null {
  const points = feature.geometry.coordinates[0].map(([lon, lat]) => map.project([lon, lat])).filter((p): p is Point => p !== null);
  const label = labelRect(feature.properties.label);
  if (label) points.push({ x: label.left, y: label.top }, { x: label.right, y: label.bottom });
  const box = rectOfPoints(points);
  return box ? minSide(padRect(box, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX) : null;
}

interface Props {
  map: () => MapHandle | undefined;
  filter: Filter;
  meta: Meta | null;
  onFilter: (next: Filter) => void;
  onSlide: (span: [number, number]) => void;
  hotSpots: HotSpotCollection;
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  onTab: (tab: Tab) => void;
}

export default function Tour(props: Props) {
  const [index, setIndex] = createSignal(-1);
  const [busy, setBusy] = createSignal(false);
  const [rects, setRects] = createSignal<Rect[]>([]);
  const [area, setArea] = createSignal<Rect>({ left: 0, top: 0, right: 0, bottom: 0 });
  const [pos, setPos] = createSignal<Point | null>(null);
  const [size, setSize] = createSignal(viewport());
  let cardEl: HTMLDivElement | undefined;
  let picked: Entry | null = null;
  let restored = false;
  const startFilter = untrack(() => props.filter);
  const spot = createMemo(() => props.hotSpots.features.find((f) => f.properties.name === TOUR_HOT_SPOT) ?? null);
  const step = createMemo(() => (index() >= 0 ? STEPS[index()] : null));

  onSettled(() => {
    let cancelled = false;
    (async () => {
      await props.map()?.whenSettled();
      await sleep(START_DELAY_MS);
      if (!cancelled) setIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  });

  const measure = () => {
    const handle = props.map();
    const current = step();
    if (!current) return;
    const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const mapBox = domRect("map") ?? screen;
    const targets = Array.isArray(current.target) ? current.target : [current.target];
    const next: Rect[] = [];
    for (const target of targets) {
      if (target === "spots" && handle) next.push(...props.hotSpots.features.map((f) => featureRect(handle, f)).filter((r): r is Rect => r !== null));
      else if (target === "pair" && handle && picked) {
        const at = handle.project([picked.lon, picked.lat]);
        if (at) next.push(minSide(padRect({ left: at.x, top: at.y, right: at.x, bottom: at.y }, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX));
      } else if (target !== "none") {
        const found = domRect(target);
        if (found) next.push(padRect(found, FIELD_TARGETS.includes(target) ? FIELD_PAD_PX : -PANEL_INSET_PX, viewport()));
      }
    }
    setSize(viewport());
    setRects(next);
    setArea(targets.every((t) => MAP_TARGETS.includes(t)) ? mapBox : screen);
  };

  createEffect(
    () => [busy(), step()] as const,
    ([working, current]) => {
      if (working || !current) return undefined;
      const frame = requestAnimationFrame(measure);
      window.addEventListener("resize", measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", measure);
      };
    },
  );

  createEffect(
    () => [rects(), area(), step()] as const,
    ([nextRects, nextArea, current]) => {
      if (!cardEl || !current) return;
      const { width, height } = cardEl.getBoundingClientRect();
      setPos(placeCard(nextRects, { width, height }, nextArea));
    },
  );

  const resetView = async () => {
    restored = true;
    props.onTab("pairs");
    const now = props.filter;
    if (now.from !== startFilter.from || now.to !== startFilter.to || now.sources.join() !== startFilter.sources.join()) props.onFilter(startFilter);
    const bounds = featureBounds(props.hotSpots);
    const handle = props.map();
    if (handle && bounds) await handle.fitBounds(bounds, RESET_PADDING_PX, START_MAX_ZOOM);
    await handle?.whenSettled();
  };

  const finish = () => {
    setIndex(-1);
    if (!restored) void resetView();
  };

  const slideFrom = (from: string) =>
    new Promise<void>((resolve) => {
      const first = dayIndex(props.filter.from);
      const last = dayIndex(from);
      const end = dayIndex(props.filter.to);
      const began = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - began) / SLIDE_MS, 1);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        props.onSlide([Math.round(first + (last - first) * eased), end]);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

  const widerFilter = (): Filter | null => {
    const meta = props.meta;
    if (!meta) return null;
    const from = addDays(props.filter.to, 1 - WIDER_RANGE_DAYS);
    let reach = from;
    if (reach < meta.min_date) reach = meta.min_date;
    return reach < props.filter.from ? { ...props.filter, from: reach } : null;
  };

  const waitFor = async (ready: () => boolean, limit: number) => {
    for (let waited = 0; waited < limit && !ready(); waited += POLL_MS) await sleep(POLL_MS);
    return ready();
  };

  const waitForEntries = () => waitFor(() => props.entries.length > 0, ENTRIES_WAIT_MS);

  const backToActivity = async (handle: MapHandle | undefined, focus: HotSpotFeature | null) => {
    props.onTab("pairs");
    const bounds = focus ? featureBounds({ type: "FeatureCollection", features: [focus] }) : null;
    if (handle && bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
    await handle?.whenSettled();
    await waitFor(() => props.entries.some((e) => e.tab === "pairs"), ENTRIES_WAIT_MS);
  };

  const next = async () => {
    const current = step();
    if (!current || busy()) return;
    const at = index();
    const handle = props.map();
    const filtersAt = STEPS.findIndex((s) => s.id === "filters");
    setBusy(true);
    setPos(null);
    try {
      const focus = spot();
      if (current.id === "spots" && handle && focus) {
        const bounds = featureBounds({ type: "FeatureCollection", features: [focus] });
        if (bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
        await handle.whenSettled();
        setIndex((await waitForEntries()) ? at + 1 : filtersAt);
      } else if (current.id === "spots") setIndex(filtersAt);
      else if (current.id === "reel") {
        const all = props.entries;
        const local = all.filter((e) => e.hotSpot === TOUR_HOT_SPOT);
        const list = local.length > 0 ? local : all;
        const entry = list[Math.floor(list.length / 2)];
        if (!entry) setIndex(filtersAt);
        else {
          picked = entry;
          props.onSelect(entry);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          setIndex(at + 1);
        }
      } else if (current.id === "details") {
        const bounds = focus ? featureBounds({ type: "FeatureCollection", features: [focus] }) : null;
        picked = null;
        props.onTab("sanctioned");
        if (handle && bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
        await handle?.whenSettled();
        const isVessel = () => props.entries.some((e) => e.tab === "sanctioned");
        if (!(await waitFor(isVessel, ENTRIES_WAIT_MS))) {
          await backToActivity(handle, focus);
          setIndex(filtersAt);
        } else setIndex(at + 1);
      } else if (current.id === "sanctioned") {
        const vessels = props.entries.filter((e) => e.tab === "sanctioned");
        const local = vessels.filter((e) => e.hotSpot === TOUR_HOT_SPOT);
        const pool = local.length > 0 ? local : vessels;
        const entry = pool[0];
        if (!entry) {
          await backToActivity(handle, focus);
          setIndex(filtersAt);
        } else {
          picked = entry;
          props.onSelect(entry);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          setIndex(at + 1);
        }
      } else if (current.id === "vessels") {
        await backToActivity(handle, focus);
        setIndex(at + 1);
      } else if (current.id === "time-range") {
        const wider = widerFilter();
        if (wider) {
          await sleep(SLIDE_DELAY_MS);
          await slideFrom(wider.from);
          await waitFor(() => props.filter.from === wider.from, ENTRIES_WAIT_MS);
          await sleep(POLL_MS);
          await handle?.whenSettled();
        }
        setIndex(at + 1);
      } else if (current.id === "sources") {
        await resetView();
        setIndex(at + 1);
      } else if (current.id === "done") finish();
      else setIndex(at + 1);
    } finally {
      setBusy(false);
    }
  };

  createEffect(
    () => [step(), busy()] as const,
    ([current, working]) => {
      if (!current) return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (working) return;
        if (e.key === "Escape") finish();
        else if (e.key === "Enter" || e.key === "ArrowRight") void next();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    },
  );

  return (
    <Show when={step()}>
      {(current) => (
        <div class="tour" role="dialog" aria-label="Guided tour">
          <Show when={!busy()}>
            <svg class="tour-shade" width={size().width} height={size().height} aria-hidden="true">
              <defs>
                <mask id="tour-mask">
                  <rect width={size().width} height={size().height} fill="white" />
                  <For each={rects()} keyed={(r) => `${r.left}-${r.top}`}>
                    {(r) => <rect x={r().left} y={r().top} width={r().right - r().left} height={r().bottom - r().top} rx={HIGHLIGHT_RADIUS_PX} fill="black" />}
                  </For>
                </mask>
              </defs>
              <rect width={size().width} height={size().height} class="tour-dim" mask="url(#tour-mask)" />
              <For each={rects()} keyed={(r) => `${r.left}-${r.top}`}>
                {(r) => <rect class="tour-outline" x={r().left} y={r().top} width={r().right - r().left} height={r().bottom - r().top} rx={HIGHLIGHT_RADIUS_PX} />}
              </For>
            </svg>
            <div ref={(el) => (cardEl = el)} class="tour-card" style={{ left: `${pos()?.x ?? 0}px`, top: `${pos()?.y ?? 0}px`, visibility: pos() ? "visible" : "hidden" }}>
              <div class="tour-count">
                {index() + 1} / {STEPS.length}
              </div>
              <h2 class="tour-title">{read(current().title)}</h2>
              <p class="tour-body">{read(current().body)}</p>
              <div class="tour-actions">
                <Show when={index() < STEPS.length - 1}>
                  <button type="button" class="tour-button" onClick={finish}>
                    Skip
                  </button>
                </Show>
                <button type="button" class="tour-button tour-button-primary" onClick={() => void next()}>
                  {read(current().next ?? "Next")}
                </button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
