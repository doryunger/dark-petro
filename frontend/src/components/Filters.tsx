import { createEffect, createSignal, For, untrack } from "solid-js";
import { fromDayIndex, sliderRange } from "../lib/dates";
import { sourceName } from "../lib/entries";
import type { Filter, Meta } from "../lib/types";
import RangeSlider from "./RangeSlider";

const APPLY_DELAY_MS = 300;

export interface FiltersHandle {
  slide(span: [number, number]): void;
}

interface Props {
  ref?: (handle: FiltersHandle) => void;
  meta: Meta;
  applied: Filter;
  onApply: (next: Filter) => void;
}

export default function Filters(props: Props) {
  const [range, setRange] = createSignal<[number, number]>(untrack(() => sliderRange(props.applied, props.meta.min_date, props.meta.max_date)));
  const [sources, setSources] = createSignal(untrack(() => props.applied.sources));

  props.ref?.({ slide: (span) => setRange(span) });

  let sent: Filter | null = null;
  const same = (a: Filter, b: Filter) => a.from === b.from && a.to === b.to && a.sources.join() === b.sources.join();

  createEffect(
    () => [range(), sources()] as const,
    ([span, picked]) => {
      const next = { from: fromDayIndex(span[0]), to: fromDayIndex(span[1]), sources: picked };
      const current = untrack(() => props.applied);
      if (same(next, current)) return undefined;
      const timer = setTimeout(() => {
        sent = next;
        props.onApply(next);
      }, APPLY_DELAY_MS);
      return () => clearTimeout(timer);
    },
    { defer: true },
  );

  createEffect(
    () => props.applied,
    (applied) => {
      if (sent && same(sent, applied)) return;
      const span = sliderRange(applied, props.meta.min_date, props.meta.max_date);
      setRange((current) => (current[0] === span[0] && current[1] === span[1] ? current : span));
      setSources((current) => (current.join() === applied.sources.join() ? current : applied.sources));
    },
  );

  const toggle = (code: string) => {
    setSources((current) => {
      if (!current.includes(code)) return [...current, code];
      return current.length === 1 ? current : current.filter((c) => c !== code);
    });
  };

  return (
    <section class="filters" data-tour="filters">
      <div class="field" data-tour="time-range">
        <h2 class="field-title">Time range</h2>
        <RangeSlider min={props.meta.min_date} max={props.meta.max_date} value={range()} onChange={setRange} />
      </div>
      <div class="field" data-tour="sources">
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
