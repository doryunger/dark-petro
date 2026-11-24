import { createEffect, createSignal, For, untrack } from "solid-js";
import { fromDayIndex, sliderRange } from "../lib/dates";
import { sourceName } from "../lib/entries";
import type { Filter, Meta } from "../lib/types";
import RangeSlider from "./RangeSlider";

const APPLY_DELAY_MS = 300;

interface Props {
  meta: Meta;
  applied: Filter;
  onApply: (next: Filter) => void;
}

export default function Filters(props: Props) {
  const [range, setRange] = createSignal<[number, number]>(untrack(() => sliderRange(props.applied, props.meta.min_date, props.meta.max_date)));
  const [sources, setSources] = createSignal(untrack(() => props.applied.sources));

  createEffect(
    () => [range(), sources()] as const,
    ([span, picked]) => {
      const next = { from: fromDayIndex(span[0]), to: fromDayIndex(span[1]), sources: picked };
      const current = untrack(() => props.applied);
      if (next.from === current.from && next.to === current.to && next.sources.join() === current.sources.join()) return undefined;
      const timer = setTimeout(() => props.onApply(next), APPLY_DELAY_MS);
      return () => clearTimeout(timer);
    },
    { defer: true },
  );

  const toggle = (code: string) => {
    setSources((current) => {
      if (!current.includes(code)) return [...current, code];
      return current.length === 1 ? current : current.filter((c) => c !== code);
    });
  };

  return (
    <section class="filters" data-tour="filters">
      <div class="field">
        <h2 class="field-title">Time range</h2>
        <RangeSlider min={props.meta.min_date} max={props.meta.max_date} value={range()} onChange={setRange} />
      </div>
      <div class="field">
        <h2 class="field-title">Source</h2>
        <div class="sources">
          <For each={props.meta.sources}>
            {(code) => (
              <label class="source">
                <input type="checkbox" checked={sources().includes(code)} onChange={() => toggle(code)} />
                {sourceName(code)}
              </label>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
