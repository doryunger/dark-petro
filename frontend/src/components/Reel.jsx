import { forwardRef, useImperativeHandle, useRef } from "react";
import { ROW_HEIGHT, ROW_TOP } from "../lib/constants.js";
import { useVirtualRows } from "../lib/virtual.js";
import EntryCard from "./EntryCard.jsx";

const Reel = forwardRef(function Reel({ entries, selectedId, order, onOrder, onSelect }, ref) {
  const scroller = useRef(null);
  const { start, end } = useVirtualRows(scroller, entries.length, ROW_HEIGHT);

  useImperativeHandle(
    ref,
    () => ({
      reveal(id) {
        const el = scroller.current;
        const index = entries.findIndex((e) => e.id === id);
        if (!el || index < 0) return;
        const top = ROW_TOP + index * ROW_HEIGHT;
        if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
          el.scrollTop = Math.max(0, top - el.clientHeight / 2 + ROW_HEIGHT / 2);
        }
      },
    }),
    [entries],
  );

  return (
    <section className="reel">
      <div className="sort">
        <label className="sort-label" htmlFor="sort">
          Sort by
        </label>
        <select className="sort-select" id="sort" value={order} onChange={(e) => onOrder(e.target.value)}>
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      <div className="entries" ref={scroller}>
        {entries.length === 0 ? (
          <p className="empty">No findings in this view.</p>
        ) : (
          <div className="entries-inner" style={{ height: ROW_TOP + entries.length * ROW_HEIGHT }}>
            {entries.slice(start, end).map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} selected={entry.id === selectedId} top={ROW_TOP + (start + i) * ROW_HEIGHT} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

export default Reel;
