import { createEffect, For } from "solid-js";
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

export default function History(props: Props) {
  let box: HTMLDivElement | undefined;

  createEffect(
    () => [props.pickedId, props.items.map((entry) => entry.id).join("\u0000")] as const,
    ([pickedId, itemSignature]) => {
      if (!itemSignature) return;
      const row = pickedId ? box?.querySelector<HTMLElement>(`[data-id="${CSS.escape(pickedId)}"]`) : null;
      if (!box || !row) return;
      if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
    },
  );

  return (
    <div class="history" data-tour="history" style={{ top: props.top, height: `${props.height}rem` }} ref={(el) => (box = el)}>
      <For each={props.items} keyed={(entry) => entry.id}>
        {(entry) => (
          <button type="button" data-id={entry().id} class={["history-item", { "history-item-selected": entry().id === props.pickedId }]} onClick={() => props.onPick(entry())}>
            <span class="history-icon" />
            <span class="history-area">{hotSpotLabel(entry().hotSpot)}</span>
            <span class="history-date">{formatDate(entry().date)}</span>
            <span class="history-source">{entry().source.toUpperCase()}</span>
          </button>
        )}
      </For>
    </div>
  );
}
