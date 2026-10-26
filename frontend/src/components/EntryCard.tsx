import { formatDate } from "../lib/dates";
import { entryIconClass, hotSpotLabel } from "../lib/entries";
import type { Entry } from "../lib/types";

interface Props {
  entry: Entry;
  selected: boolean;
  top: string;
  onSelect: (entry: Entry) => void;
}

export default function EntryCard({ entry, selected, top, onSelect }: Props) {
  return (
    <article
      className={`entry${selected ? " entry-selected" : ""}`}
      style={{ top }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entry);
        }
      }}
    >
      <span className={entryIconClass(entry)} />
      <div className="entry-id">{entry.shortId}</div>
      <div className="entry-meta">
        <span className="entry-area">{hotSpotLabel(entry.hotSpot)}</span>
        <span className="entry-date">{formatDate(entry.date)}</span>
        <span className="entry-source">{entry.source.toUpperCase()}</span>
      </div>
    </article>
  );
}
