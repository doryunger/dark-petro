import { formatDate } from "../lib/dates";
import { entryIconClass, entryTitle, hotSpotLabel } from "../lib/entries";
import type { Entry } from "../lib/types";

interface Props {
  entry: Entry;
  selected: boolean;
  pinned?: boolean;
  open?: boolean;
  top: string;
  onSelect: (entry: Entry) => void;
}

export default function EntryCard({ entry, selected, pinned = false, open = false, top, onSelect }: Props) {
  const count = entry.detections ?? 1;
  const hasCount = count > 1;
  const hasIndicators = hasCount || entry.hasRelatedActivity;
  return (
    <button
      type="button"
      className={`entry${selected ? " entry-selected" : ""}${pinned ? " entry-pinned" : ""}${open ? " entry-open" : ""}${hasIndicators ? " entry-has-indicators" : ""}`}
      style={{ top }}
      title={pinned ? "Outside the current map view. Click to go back to it." : undefined}
      aria-label={`${entryTitle(entry)}${pinned ? ", outside the current map view" : ""}${entry.hasRelatedActivity ? ", has related suspicious activity" : ""}`}
      onClick={() => onSelect(entry)}
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
    </button>
  );
}
