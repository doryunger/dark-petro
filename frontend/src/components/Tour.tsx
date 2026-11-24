import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { START_MAX_ZOOM, TOUR_HOT_SPOT } from "../lib/constants";
import { featureBounds } from "../lib/geo";
import { minSide, padRect, placeCard, rectOfPoints, type Point, type Rect, type Size } from "../lib/tour";
import type { Bounds, Entry, HotSpotCollection, HotSpotFeature, Tab, TrackPoint } from "../lib/types";
import type { MapHandle } from "./MapView";

const START_DELAY_MS = 600;
const ENTRIES_WAIT_MS = 6000;
const POLL_MS = 200;
const HIGHLIGHT_PAD_PX = 8;
const MIN_HIGHLIGHT_PX = 56;
const PANEL_INSET_PX = 1;
const HIGHLIGHT_RADIUS_PX = 4;
const FIT_PADDING_PX = 150;
const TRACK_MAX_ZOOM = 12;
const HISTORY_WAIT_MS = 5000;
const RESET_PADDING_PX = 48;

type Target = "none" | "spots" | "reel" | "details" | "pair" | "tabs" | "card" | "history" | "track" | "filters";

interface Step {
  id: string;
  title: string;
  body: string;
  altBody?: string;
  target: Target;
  next?: string;
}

const STEPS: Step[] = [
  {
    id: "intro",
    title: "What Dark Petro shows",
    body: "Dark Petro looks for oil being moved from ship to ship at sea (STS transfers) in satellite imagery. Each finding is two vessels lying close together, and a vessel on a sanctions list is flagged in red. This short tour walks through the screen.",
    target: "none",
  },
  {
    id: "spots",
    title: "Hot spots",
    body: "The outlined areas are the hot spots, the stretches of sea where STS transfers are known to take place. Every STS detection is aggregated by the hot spot it falls in.",
    target: "spots",
    next: "Zoom in",
  },
  {
    id: "reel",
    title: "Detections",
    body: "Every STS detection in the current map view is listed here, with its hot spot, capture date and satellite source. Pan or zoom the map and the list follows; sort by latest or oldest, or switch to the sanctioned vessels tab.",
    target: "reel",
    next: "Select a detection",
  },
  {
    id: "details",
    title: "Capture details",
    body: "Selecting a detection opens its capture: the satellite image of the pair, the capture time, and for each vessel its name, registration and flag, with a Sanctioned badge when it is listed.",
    target: "details",
  },
  {
    id: "pair",
    title: "Selected STS",
    body: "The same detection is ringed in cyan on the map, and the map flew to it. Each icon is two vessels side by side: yellow when neither is sanctioned, red when at least one is. Hover any icon for a quick look, or click it to select that detection.",
    target: "pair",
    next: "Sanctioned vessels",
  },
  {
    id: "sanctioned",
    title: "Sanctioned vessels",
    body: "The second tab lists single vessels from the sanctions list instead of pairs. The map is zoomed out to the whole hot spot, so every sanctioned vessel detected there is in view.",
    target: "tabs",
    next: "Pick a vessel",
  },
  {
    id: "vessels",
    title: "A sanctioned vessel",
    body: "Each entry is one vessel, with its hot spot, capture date and satellite source. This one was seen more than once: the ×N badge is the number of positions recorded for it in the time range.",
    altBody: "Each entry is one vessel, with its hot spot, capture date and satellite source. Here no vessel has more than one position in the time range, so there is no track to follow.",
    target: "card",
    next: "Show previous positions",
  },
  {
    id: "positions",
    title: "Previous positions",
    body: "The other positions of this vessel are listed under it, newest first, each with its hot spot, date and satellite. Selecting one opens the capture from that moment.",
    target: "history",
    next: "Select a position",
  },
  {
    id: "track",
    title: "The vessel's track",
    body: "The map now shows where this vessel was seen. The cyan icon is its latest position, the grey one is the previous position just picked, any other previous positions are light red, and the line joins them in time order. Positions can lie well outside the hot spot.",
    target: "track",
  },
  {
    id: "filters",
    title: "Filters",
    body: "Time range keeps only the detections captured between the two dates, and Source chooses the satellites: Sentinel-1 (radar) and Sentinel-2 (optical). The map and the list update together.",
    target: "filters",
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
  hotSpots: HotSpotCollection;
  entries: Entry[];
  history: Entry[];
  points: TrackPoint[];
  onSelect: (entry: Entry) => void;
  onTab: (tab: Tab) => void;
  onPick: (entry: Entry) => void;
}

export default function Tour(props: Props) {
  const [index, setIndex] = createSignal(-1);
  const [busy, setBusy] = createSignal(false);
  const [rects, setRects] = createSignal<Rect[]>([]);
  const [area, setArea] = createSignal<Rect>({ left: 0, top: 0, right: 0, bottom: 0 });
  const [pos, setPos] = createSignal<Point | null>(null);
  const [size, setSize] = createSignal(viewport());
  const [multi, setMulti] = createSignal(false);
  let cardEl: HTMLDivElement | undefined;
  let picked: Entry | null = null;
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
    let next: Rect[] = [];
    if (current.target === "spots" && handle) next = props.hotSpots.features.map((f) => featureRect(handle, f)).filter((r): r is Rect => r !== null);
    else if (current.target === "pair" && handle && picked) {
      const at = handle.project([picked.lon, picked.lat]);
      if (at) next = [minSide(padRect({ left: at.x, top: at.y, right: at.x, bottom: at.y }, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX)];
    } else if (current.target === "track" && handle) {
      const projected = props.points.map((p) => handle.project([p.lon, p.lat])).filter((p): p is Point => p !== null);
      const box = rectOfPoints(projected);
      if (box) next = [minSide(padRect(box, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX)];
    } else if (current.target !== "none") {
      const found = domRect(current.target);
      if (found) next = [padRect(found, -PANEL_INSET_PX, viewport())];
    }
    setSize(viewport());
    setRects(next);
    setArea(["spots", "pair", "track"].includes(current.target) ? mapBox : screen);
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

  const finish = () => {
    setIndex(-1);
    props.onTab("pairs");
    const bounds = featureBounds(props.hotSpots);
    const handle = props.map();
    if (handle && bounds) void handle.fitBounds(bounds, RESET_PADDING_PX, START_MAX_ZOOM);
  };

  const waitFor = async (ready: () => boolean, limit: number) => {
    for (let waited = 0; waited < limit && !ready(); waited += POLL_MS) await sleep(POLL_MS);
    return ready();
  };

  const waitForEntries = () => waitFor(() => props.entries.length > 0, ENTRIES_WAIT_MS);

  const next = async () => {
    const current = step();
    if (!current || busy()) return;
    const at = index();
    const repeatedKnown = multi();
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
      } else if (current.id === "pair") {
        const bounds = focus ? featureBounds({ type: "FeatureCollection", features: [focus] }) : null;
        picked = null;
        props.onTab("sanctioned");
        if (handle && bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
        await handle?.whenSettled();
        const isVessel = () => props.entries.some((e) => e.tab === "sanctioned");
        if (!(await waitFor(isVessel, ENTRIES_WAIT_MS))) setIndex(filtersAt);
        else setIndex(at + 1);
      } else if (current.id === "sanctioned") {
        const vessels = props.entries.filter((e) => e.tab === "sanctioned");
        const local = vessels.filter((e) => e.hotSpot === TOUR_HOT_SPOT);
        const pool = local.length > 0 ? local : vessels;
        const repeated = pool.find((e) => (e.detections ?? 1) > 1);
        const entry = repeated ?? pool[0];
        if (!entry) setIndex(filtersAt);
        else {
          props.onSelect(entry);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          setMulti(Boolean(repeated) && (await waitFor(() => props.history.length > 0, HISTORY_WAIT_MS)));
          setIndex(at + 1);
        }
      } else if (current.id === "vessels" && !repeatedKnown) setIndex(filtersAt);
      else if (current.id === "positions") {
        const previous = props.history[0];
        if (previous) {
          props.onPick(previous);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          const all = props.points.map((p) => ({ lon: p.lon, lat: p.lat }));
          const lons = all.map((p) => p.lon);
          const lats = all.map((p) => p.lat);
          if (handle && all.length > 1) {
            const bounds: Bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
            await handle.fitBounds(bounds, FIT_PADDING_PX, TRACK_MAX_ZOOM);
            await handle.whenSettled();
          }
        }
        setIndex(at + 1);
      } else if (current.id === "filters") finish();
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
              <h2 class="tour-title">{current().title}</h2>
              <p class="tour-body">{!multi() && current().altBody ? current().altBody : current().body}</p>
              <div class="tour-actions">
                <button type="button" class="tour-button" onClick={finish}>
                  Skip
                </button>
                <button type="button" class="tour-button tour-button-primary" onClick={() => void next()}>
                  {index() === STEPS.length - 1 ? "Finish" : (current().next ?? "Next")}
                </button>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
