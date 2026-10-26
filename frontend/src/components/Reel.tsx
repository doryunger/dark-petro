import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { ENTRY_HEIGHT_REM, REVEAL_MS, ROW_HEIGHT_REM, ROW_TOP_REM } from "../lib/constants";
import { historyHeight } from "../lib/groups";
import { remPx } from "../lib/units";
import { revealScrollTop, rowOffset, useVirtualRows } from "../lib/virtual";
import type { Entry, Order, Tab } from "../lib/types";
import EntryCard from "./EntryCard";
import History from "./History";
import Tabs from "./Tabs";

export interface ReelHandle {
  reveal(id: string): void;
}

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  entries: Entry[];
  selectedId: string | null;
  openId?: string | null;
  history?: Entry[];
  pickedId?: string | null;
  onPick?: (entry: Entry) => void;
  order: Order;
  onOrder: (order: Order) => void;
  onSelect: (entry: Entry) => void;
}

const Reel = forwardRef<ReelHandle, Props>(function Reel({ tab, onTab, entries, selectedId, openId = null, history = [], pickedId = null, onPick, order, onOrder, onSelect }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const rem = remPx();
  const rowHeight = ROW_HEIGHT_REM * rem;
  const openIndex = openId ? entries.findIndex((e) => e.id === openId) : -1;
  const historyRem = openIndex >= 0 ? historyHeight(history.length || (entries[openIndex].detections ?? 1) - 1) : 0;
  const gap = openIndex >= 0 ? { index: openIndex, height: historyRem * rem } : undefined;
  const { start, end } = useVirtualRows(scroller, entries.length, rowHeight, gap);

  const pending = useRef<{ id: string; until: number } | null>(null);

  const apply = useCallback(() => {
    const el = scroller.current;
    const wanted = pending.current;
    if (!el || !wanted || Date.now() > wanted.until) return;
    const index = entries.findIndex((e) => e.id === wanted.id);
    if (index >= 0) el.scrollTop = revealScrollTop(index, entries.length, rowHeight, el.clientHeight - ROW_TOP_REM * rem, gap);
  }, [entries, rowHeight, rem, gap?.index, gap?.height]);

  useEffect(apply, [apply]);

  useEffect(() => {
    pending.current = null;
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [tab]);

  useImperativeHandle(
    ref,
    () => ({
      reveal(id) {
        pending.current = { id, until: Date.now() + REVEAL_MS };
        apply();
      },
    }),
    [apply],
  );

  const release = () => {
    pending.current = null;
  };

  return (
    <section className="reel">
      <Tabs tab={tab} onTab={onTab} />
      <div className="sort">
        <label className="sort-label" htmlFor="sort">
          Sort by
        </label>
        <select className="sort-select" id="sort" value={order} onChange={(e) => onOrder(e.target.value as Order)}>
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      <div className="entries" ref={scroller} onWheel={release} onPointerDown={release}>
        {entries.length === 0 ? (
          <p className="empty">No findings in this view.</p>
        ) : (
          <div className="entries-inner" style={{ height: `${ROW_TOP_REM + entries.length * ROW_HEIGHT_REM + historyRem}rem` }}>
            {entries.slice(start, end).map((entry, i) => {
              const top = ROW_TOP_REM + rowOffset(start + i, ROW_HEIGHT_REM, openIndex >= 0 ? { index: openIndex, height: historyRem } : undefined);
              return (
                <Fragment key={entry.id}>
                  <EntryCard entry={entry} selected={entry.id === selectedId} open={entry.id === openId} top={`${top}rem`} onSelect={onSelect} />
                  {entry.id === openId && onPick && <History key={entry.id} items={history} pickedId={pickedId} top={`${top + ENTRY_HEIGHT_REM}rem`} height={historyRem} onPick={onPick} />}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});

export default Reel;
