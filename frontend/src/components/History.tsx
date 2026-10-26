import { useEffect, useRef } from "react";
import { formatDate } from "../lib/dates";
import { hotSpotLabel } from "../lib/entries";
import type { Entry } from "../lib/types";

interface Props {
  items: Entry[];
  pickedId: string | null;
  top: string;
  height: number;
  onPick: (entry: Entry) => void;
}

export default function History({ items, pickedId, top, height, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    const row = pickedId ? el?.querySelector<HTMLElement>(`[data-id="${CSS.escape(pickedId)}"]`) : null;
    if (!el || !row) return;
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight;
  }, [pickedId, items]);

  return (
    <div className="history" style={{ top, height: `${height}rem` }} ref={box}>
      {items.map((entry) => (
        <div
          key={entry.id}
          data-id={entry.id}
          className={`history-item${entry.id === pickedId ? " history-item-selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onPick(entry)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPick(entry);
            }
          }}
        >
          <span className="history-icon" />
          <span className="history-area">{hotSpotLabel(entry.hotSpot)}</span>
          <span className="history-date">{formatDate(entry.date)}</span>
          <span className="history-source">{entry.source.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
