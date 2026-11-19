import { For } from "solid-js";
import { TABS, TAB_LABELS } from "../lib/constants";
import type { Tab } from "../lib/types";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
}

export default function Tabs(props: Props) {
  return (
    <div class="tabs" role="tablist" data-tour="tabs">
      <For each={TABS}>
        {(id) => (
          <button class={["tab", { "tab-active": id === props.tab }]} type="button" role="tab" aria-selected={id === props.tab ? "true" : "false"} onClick={() => id !== props.tab && props.onTab(id)}>
            {TAB_LABELS[id]}
          </button>
        )}
      </For>
    </div>
  );
}
