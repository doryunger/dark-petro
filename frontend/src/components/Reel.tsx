import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { ENTRY_HEIGHT_REM, REVEAL_MS, ROW_HEIGHT_REM, ROW_TOP_REM } from "../lib/constants";
import { historyHeight } from "../lib/groups";
import { remPx } from "../lib/units";
import { createVirtualRows, revealScrollTop, rowOffset, type Gap } from "../lib/virtual";
import type { Entry, Order, Tab } from "../lib/types";
import EntryCard from "./EntryCard";
import History from "./History";
import Tabs from "./Tabs";

export interface ReelHandle {
  reveal(id: string): void;
}

interface Props {
  ref?: (handle: ReelHandle) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  entries: Entry[];
  selectedId: string | null;
  pinnedId: string | null;
  openId: string | null;
  history: Entry[];
  pickedId: string | null;
  onPick: (entry: Entry) => void;
  order: Order;
  onOrder: (order: Order) => void;
  onSelect: (entry: Entry) => void;
}

export default function Reel(props: Props) {
  let scroller: HTMLDivElement | undefined;
  let pending: { id: string; until: number } | null = null;
  const [rem, setRem] = createSignal(remPx());
  const rowHeight = () => ROW_HEIGHT_REM * rem();
  const openIndex = createMemo(() => (props.openId ? props.entries.findIndex((e) => e.id === props.openId) : -1));
  const historyRem = createMemo(() => {
    const index = openIndex();
    return index >= 0 ? historyHeight(props.history.length || (props.entries[index].detections ?? 1) - 1) : 0;
  });
  const gap = createMemo(() => (openIndex() >= 0 ? { index: openIndex(), height: historyRem() * rem() } : undefined));
  const range = createVirtualRows(() => scroller, () => props.entries.length, rowHeight, gap);
  const rows = createMemo(() => props.entries.slice(range().start, range().end).map((entry, i) => ({ entry, index: range().start + i })));

  const scrollToPending = (entries: Entry[], height: number, unit: number, spacer: Gap | undefined) => {
    const el = scroller;
    const wanted = pending;
    if (!el || !wanted || Date.now() > wanted.until) return;
    const index = entries.findIndex((e) => e.id === wanted.id);
    if (index >= 0) el.scrollTop = revealScrollTop(index, entries.length, height, el.clientHeight - ROW_TOP_REM * unit, spacer);
  };

  createEffect(() => [props.entries, rowHeight(), rem(), gap()] as const, ([entries, height, unit, spacer]) => scrollToPending(entries, height, unit, spacer));

  createEffect(
    () => props.tab,
    () => {
      pending = null;
      if (scroller) scroller.scrollTop = 0;
    },
    { defer: true },
  );

  createEffect(
    () => props.pinnedId,
    (pinnedId) => {
      if (!pinnedId) return;
      pending = null;
      if (scroller) scroller.scrollTop = 0;
    },
  );

  onSettled(() => {
    props.ref?.({
      reveal(id) {
        pending = { id, until: Date.now() + REVEAL_MS };
        scrollToPending(props.entries, rowHeight(), rem(), gap());
      },
    });
    const resize = () => setRem(remPx());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  });

  const release = () => {
    pending = null;
  };

  return (
    <section class="reel" data-tour="reel">
      <Tabs tab={props.tab} onTab={props.onTab} />
      <div class="sort">
        <label class="sort-label" for="sort">
          Sort by
        </label>
        <select class="sort-select" id="sort" value={props.order} onChange={(e) => props.onOrder(e.currentTarget.value as Order)}>
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      <div class="entries" ref={(el) => (scroller = el)} onWheel={release} onPointerDown={release}>
        <Show when={props.entries.length > 0} fallback={<p class="empty">No findings in this view.</p>}>
          <div class="entries-inner" style={{ height: `${ROW_TOP_REM + props.entries.length * ROW_HEIGHT_REM + historyRem()}rem` }}>
            <For each={rows()} keyed={(row) => row.entry.id}>
              {(row) => {
                const top = () => ROW_TOP_REM + rowOffset(row().index, ROW_HEIGHT_REM, openIndex() >= 0 ? { index: openIndex(), height: historyRem() } : undefined);
                return (
                  <>
                    <EntryCard
                      entry={row().entry}
                      selected={row().entry.id === props.selectedId}
                      pinned={row().entry.id === props.pinnedId}
                      open={row().entry.id === props.openId}
                      top={`${top()}rem`}
                      onSelect={props.onSelect}
                    />
                    <Show when={row().entry.id === props.openId}>
                      <History items={props.history} pickedId={props.pickedId} top={`${top() + ENTRY_HEIGHT_REM}rem`} height={historyRem()} onPick={props.onPick} />
                    </Show>
                  </>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}
