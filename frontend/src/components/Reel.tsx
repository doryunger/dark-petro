import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { REVEAL_MS, ROW_HEIGHT_REM, ROW_TOP_REM } from "../lib/constants";
import { remPx } from "../lib/units";
import { revealScrollTop, useVirtualRows } from "../lib/virtual";
import type { Entry, Order } from "../lib/types";
import EntryCard from "./EntryCard";

export interface ReelHandle {
  reveal(id: string): void;
}

interface Props {
  entries: Entry[];
  selectedId: string | null;
  order: Order;
  onOrder: (order: Order) => void;
  onSelect: (entry: Entry) => void;
}

const Reel = forwardRef<ReelHandle, Props>(function Reel({ entries, selectedId, order, onOrder, onSelect }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const rem = remPx();
  const rowHeight = ROW_HEIGHT_REM * rem;
  const { start, end } = useVirtualRows(scroller, entries.length, rowHeight);

  const pending = useRef<{ id: string; until: number } | null>(null);

  const apply = useCallback(() => {
    const el = scroller.current;
    const wanted = pending.current;
    if (!el || !wanted || Date.now() > wanted.until) return;
    const index = entries.findIndex((e) => e.id === wanted.id);
    if (index >= 0) el.scrollTop = revealScrollTop(index, entries.length, rowHeight, el.clientHeight - ROW_TOP_REM * rem);
  }, [entries, rowHeight, rem]);

  useEffect(apply, [apply]);

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
          <div className="entries-inner" style={{ height: `${ROW_TOP_REM + entries.length * ROW_HEIGHT_REM}rem` }}>
            {entries.slice(start, end).map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} selected={entry.id === selectedId} top={`${ROW_TOP_REM + (start + i) * ROW_HEIGHT_REM}rem`} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

export default Reel;
