import { useEffect, useRef, useState } from "react";
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

export default function Filters({ meta, applied, onApply }: Props) {
  const [range, setRange] = useState<[number, number]>(() => sliderRange(applied, meta.min_date, meta.max_date));
  const [sources, setSources] = useState(applied.sources);

  const latest = useRef({ applied, onApply });
  latest.current = { applied, onApply };
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    const next = { from: fromDayIndex(range[0]), to: fromDayIndex(range[1]), sources };
    const { applied: current } = latest.current;
    if (next.from === current.from && next.to === current.to && next.sources.join() === current.sources.join()) return undefined;
    const timer = setTimeout(() => latest.current.onApply(next), APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [range, sources]);

  const toggle = (code: string) => {
    setSources((current) => {
      if (!current.includes(code)) return [...current, code];
      return current.length === 1 ? current : current.filter((c) => c !== code);
    });
  };

  return (
    <section className="filters">
      <div className="field">
        <h2 className="field-title">Time range</h2>
        <RangeSlider min={meta.min_date} max={meta.max_date} value={range} onChange={setRange} />
      </div>
      <div className="field">
        <h2 className="field-title">Source</h2>
        <div className="sources">
          {meta.sources.map((code) => (
            <label className="source" key={code}>
              <input type="checkbox" checked={sources.includes(code)} onChange={() => toggle(code)} />
              {sourceName(code)}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
