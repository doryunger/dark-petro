import { formatDate } from "../lib/dates";
import { entryIconClass, entryTitle, hotSpotLabel } from "../lib/entries";
import type { Entry } from "../lib/types";

interface Props {
  entry: Entry;
  selected: boolean;
  open?: boolean;
  top: string;
  onSelect: (entry: Entry) => void;
}

export default function EntryCard({ entry, selected, open = false, top, onSelect }: Props) {
  const count = entry.detections ?? 1;
  const hasCount = count > 1;
  const hasIndicators = hasCount || entry.hasRelatedActivity;
  return (
    <article
      className={`entry${selected ? " entry-selected" : ""}${open ? " entry-open" : ""}${hasIndicators ? " entry-has-indicators" : ""}`}
      style={{ top }}
      role="button"
      tabIndex={0}
      aria-label={`${entryTitle(entry)}${entry.hasRelatedActivity ? ", has related suspicious activity" : ""}`}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entry);
        }
      }}
    >
      <span className={entryIconClass(entry)} />
      <div className="entry-id">{entryTitle(entry)}</div>
      {hasIndicators && <span className="entry-indicators">
        {entry.hasRelatedActivity && <span className="entry-related-activity" title="Related suspicious activity" aria-hidden="true" />}
        {hasCount && <span className="entry-count">×{count}</span>}
      </span>}
      <div className="entry-meta">
        <span className="entry-area">{hotSpotLabel(entry.hotSpot)}</span>
        <span className="entry-date">{formatDate(entry.date)}</span>
        <span className="entry-source">{entry.source.toUpperCase()}</span>
      </div>
    </article>
  );
}
