import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { TOUR_HOT_SPOT } from "../lib/constants";
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
    title: "Cards",
    body: "Every detection in the current map view is a card, with its hot spot, capture date and satellite source. Pan or zoom the map and the list follows; sort by latest or oldest, or switch to the sanctioned vessels tab.",
    target: "reel",
    next: "Pick a card",
  },
  {
    id: "details",
    title: "Capture details",
    body: "Choosing a card opens its capture: the satellite image of the pair, the capture time, and for each vessel its name, registration and flag, with a Sanctioned badge when it is listed.",
    target: "details",
  },
  {
    id: "pair",
    title: "Selected STS",
    body: "The same detection is ringed in cyan on the map, and the map flew to it. Each icon is two vessels side by side: yellow when neither is sanctioned, red when at least one is. Hover any icon for a quick look, or click it to open its card.",
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
    body: "Each card is one vessel, with its hot spot, capture date and satellite source. This one was seen more than once: the badge on its card (×N) is the number of positions in the time range.",
    altBody: "Each card is one vessel, with its hot spot, capture date and satellite source. Here no vessel has more than one position in the time range, so there is no track to follow.",
    target: "card",
    next: "Previous positions",
  },
  {
    id: "positions",
    title: "Previous positions",
    body: "The other positions of this vessel are listed under its card, newest first, each with its hot spot, date and satellite. Clicking one opens the capture from that moment.",
    target: "history",
    next: "Pick one",
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
    body: "Time range keeps only the detections captured between the two dates, and Source chooses the satellites: Sentinel-1 (radar) and Sentinel-2 (optical). The map and the cards update together.",
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
  map: RefObject<MapHandle | null>;
  hotSpots: HotSpotCollection;
  entries: Entry[];
  history: Entry[];
  points: TrackPoint[];
  onSelect: (entry: Entry) => void;
  onTab: (tab: Tab) => void;
  onPick: (entry: Entry) => void;
}

export default function Tour({ map, hotSpots, entries, history, points, onSelect, onTab, onPick }: Props) {
  const [index, setIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [rects, setRects] = useState<Rect[]>([]);
  const [area, setArea] = useState<Rect>({ left: 0, top: 0, right: 0, bottom: 0 });
  const [pos, setPos] = useState<Point | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const historyRef = useRef(history);
  historyRef.current = history;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const picked = useRef<Entry | null>(null);
  const [multi, setMulti] = useState(false);
  const spot = hotSpots.features.find((f) => f.properties.name === TOUR_HOT_SPOT) ?? null;

  const step = index >= 0 ? STEPS[index] : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await map.current?.whenSettled();
      await sleep(START_DELAY_MS);
      if (!cancelled) setIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [map]);

  const measure = useCallback(() => {
    const handle = map.current;
    if (!step) return;
    const screen = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const mapBox = domRect("map") ?? screen;
    let next: Rect[] = [];
    if (step.target === "spots" && handle) next = hotSpots.features.map((f) => featureRect(handle, f)).filter((r): r is Rect => r !== null);
    else if (step.target === "pair" && handle && picked.current) {
      const at = handle.project([picked.current.lon, picked.current.lat]);
      if (at) next = [minSide(padRect({ left: at.x, top: at.y, right: at.x, bottom: at.y }, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX)];
    } else if (step.target === "track" && handle) {
      const projected = pointsRef.current.map((p) => handle.project([p.lon, p.lat])).filter((p): p is Point => p !== null);
      const box = rectOfPoints(projected);
      if (box) next = [minSide(padRect(box, HIGHLIGHT_PAD_PX, viewport()), MIN_HIGHLIGHT_PX)];
    } else if (step.target !== "none") {
      const found = domRect(step.target);
      if (found) next = [padRect(found, -PANEL_INSET_PX, viewport())];
    }
    setRects(next);
    setArea(["spots", "pair", "track"].includes(step.target) ? mapBox : screen);
  }, [map, step, hotSpots]);

  useEffect(() => {
    if (busy || !step) return undefined;
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [measure, busy, step]);

  useLayoutEffect(() => {
    if (!cardRef.current || !step) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    setPos(placeCard(rects, { width, height }, area));
  }, [rects, area, step]);

  const finish = useCallback(() => setIndex(-1), []);

  const waitFor = useCallback(async (ready: () => boolean, limit: number) => {
    for (let waited = 0; waited < limit && !ready(); waited += POLL_MS) await sleep(POLL_MS);
    return ready();
  }, []);

  const waitForEntries = useCallback(() => waitFor(() => entriesRef.current.length > 0, ENTRIES_WAIT_MS), [waitFor]);

  const next = useCallback(async () => {
    if (!step || busy) return;
    const handle = map.current;
    const filtersAt = STEPS.findIndex((s) => s.id === "filters");
    setBusy(true);
    setPos(null);
    try {
      if (step.id === "spots" && handle && spot) {
        const bounds = featureBounds({ type: "FeatureCollection", features: [spot] });
        if (bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
        await handle.whenSettled();
        setIndex((await waitForEntries()) ? index + 1 : filtersAt);
      } else if (step.id === "spots") setIndex(filtersAt);
      else if (step.id === "reel") {
        const all = entriesRef.current;
        const local = all.filter((e) => e.hotSpot === TOUR_HOT_SPOT);
        const list = local.length > 0 ? local : all;
        const entry = list[Math.floor(list.length / 2)];
        if (!entry) setIndex(filtersAt);
        else {
          picked.current = entry;
          onSelect(entry);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          setIndex(index + 1);
        }
      } else if (step.id === "pair") {
        const bounds = spot ? featureBounds({ type: "FeatureCollection", features: [spot] }) : null;
        picked.current = null;
        onTab("sanctioned");
        if (handle && bounds) await handle.fitBounds(bounds, FIT_PADDING_PX);
        await handle?.whenSettled();
        const isVessel = () => entriesRef.current.some((e) => e.tab === "sanctioned");
        if (!(await waitFor(isVessel, ENTRIES_WAIT_MS))) setIndex(filtersAt);
        else setIndex(index + 1);
      } else if (step.id === "sanctioned") {
        const vessels = entriesRef.current.filter((e) => e.tab === "sanctioned");
        const local = vessels.filter((e) => e.hotSpot === TOUR_HOT_SPOT);
        const pool = local.length > 0 ? local : vessels;
        const repeated = pool.find((e) => (e.detections ?? 1) > 1);
        const entry = repeated ?? pool[0];
        if (!entry) setIndex(filtersAt);
        else {
          onSelect(entry);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          setMulti(Boolean(repeated) && (await waitFor(() => historyRef.current.length > 0, HISTORY_WAIT_MS)));
          setIndex(index + 1);
        }
      } else if (step.id === "vessels" && !multi) setIndex(filtersAt);
      else if (step.id === "positions") {
        const previous = historyRef.current[0];
        if (previous) {
          onPick(previous);
          await sleep(POLL_MS);
          await handle?.whenSettled();
          const all = pointsRef.current.map((p) => ({ lon: p.lon, lat: p.lat }));
          const lons = all.map((p) => p.lon);
          const lats = all.map((p) => p.lat);
          if (handle && all.length > 1) {
            const bounds: Bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
            await handle.fitBounds(bounds, FIT_PADDING_PX, TRACK_MAX_ZOOM);
            await handle.whenSettled();
          }
        }
        setIndex(index + 1);
      } else if (step.id === "filters") finish();
      else setIndex(index + 1);
    } finally {
      setBusy(false);
    }
  }, [step, busy, map, spot, index, multi, waitFor, waitForEntries, onSelect, onTab, onPick, finish]);

  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") finish();
      else if (e.key === "Enter" || e.key === "ArrowRight") void next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, busy, next, finish]);

  if (!step) return null;
  const { width, height } = viewport();
  const last = index === STEPS.length - 1;

  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      {!busy && (
        <svg className="tour-shade" width={width} height={height} aria-hidden="true">
          <defs>
            <mask id="tour-mask">
              <rect width={width} height={height} fill="white" />
              {rects.map((r) => (
                <rect key={`${r.left}-${r.top}`} x={r.left} y={r.top} width={r.right - r.left} height={r.bottom - r.top} rx={HIGHLIGHT_RADIUS_PX} fill="black" />
              ))}
            </mask>
          </defs>
          <rect width={width} height={height} className="tour-dim" mask="url(#tour-mask)" />
          {rects.map((r) => (
            <rect key={`o-${r.left}-${r.top}`} className="tour-outline" x={r.left} y={r.top} width={r.right - r.left} height={r.bottom - r.top} rx={HIGHLIGHT_RADIUS_PX} />
          ))}
        </svg>
      )}
      {!busy && (
        <div ref={cardRef} className="tour-card" style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? "visible" : "hidden" }}>
          <div className="tour-count">
            {index + 1} / {STEPS.length}
          </div>
          <h2 className="tour-title">{step.title}</h2>
          <p className="tour-body">{!multi && step.altBody ? step.altBody : step.body}</p>
          <div className="tour-actions">
            <button type="button" className="tour-button" onClick={finish}>
              Skip
            </button>
            <button type="button" className="tour-button tour-button-primary" onClick={() => void next()}>
              {last ? "Finish" : (step.next ?? "Next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
