import { TABS, TAB_LABELS } from "../lib/constants";
import type { Tab } from "../lib/types";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
}

export default function Tabs({ tab, onTab }: Props) {
  return (
    <div className="tabs" role="tablist">
      {TABS.map((id) => (
        <button key={id} className={`tab${id === tab ? " tab-active" : ""}`} type="button" role="tab" aria-selected={id === tab} onClick={() => id !== tab && onTab(id)}>
          {TAB_LABELS[id]}
        </button>
      ))}
    </div>
  );
}
