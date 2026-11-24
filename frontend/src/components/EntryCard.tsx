import { Show } from "solid-js";
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

export default function EntryCard(props: Props) {
  const count = () => props.entry.detections ?? 1;
  const hasCount = () => count() > 1;
  const hasIndicators = () => hasCount() || Boolean(props.entry.hasRelatedActivity);
  return (
    <button
      type="button"
      class={["entry", { "entry-selected": props.selected, "entry-pinned": props.pinned, "entry-open": props.open, "entry-has-indicators": hasIndicators() }]}
      style={{ top: props.top }}
      data-tour={props.selected ? "card" : undefined}
      title={props.pinned ? "Outside the current map view. Click to go back to it." : undefined}
      aria-label={`${entryTitle(props.entry)}${props.pinned ? ", outside the current map view" : ""}${props.entry.hasRelatedActivity ? ", has related suspicious activity" : ""}`}
      onClick={() => props.onSelect(props.entry)}
    >
      <span class={entryIconClass(props.entry)} />
      <div class="entry-id">{entryTitle(props.entry)}</div>
      <Show when={hasIndicators()}>
        <span class="entry-indicators">
          <Show when={props.entry.hasRelatedActivity}>
            <span class="entry-related-activity" title="Related suspicious activity" aria-hidden="true" />
          </Show>
          <Show when={hasCount()}>
            <span class="entry-count">×{count()}</span>
          </Show>
        </span>
      </Show>
      <div class="entry-meta">
        <span class="entry-area">{hotSpotLabel(props.entry.hotSpot)}</span>
        <span class="entry-date">{formatDate(props.entry.date)}</span>
        <span class="entry-source">{props.entry.source.toUpperCase()}</span>
      </div>
    </button>
  );
}
