import { formatDate } from "../lib/dates.js";
import { hotSpotLabel } from "../lib/entries.js";

export default function EntryCard({ entry, selected, top, onSelect }) {
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
      <span className={`entry-icon${entry.sanctioned ? " entry-icon-sanctioned" : ""}`} />
      <div className="entry-id">{entry.shortId}</div>
      <div className="entry-meta">
        <span className="entry-area">{hotSpotLabel(entry.hotSpot)}</span>
        <span className="entry-date">{formatDate(entry.date)}</span>
        <span className="entry-source">{entry.source.toUpperCase()}</span>
      </div>
    </article>
  );
}
