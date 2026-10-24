import { useState } from "react";
import { fromDayIndex, sliderRange } from "../lib/dates.js";
import { sourceName } from "../lib/entries.js";
import RangeSlider from "./RangeSlider.jsx";

export default function Filters({ meta, applied, onApply }) {
  const [range, setRange] = useState(() => sliderRange(applied, meta.min_date, meta.max_date));
  const [sources, setSources] = useState(applied.sources);

  const toggle = (code) => {
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
          <button className="filter-button" type="button" onClick={() => onApply({ from: fromDayIndex(range[0]), to: fromDayIndex(range[1]), sources })}>
            Filter
          </button>
        </div>
      </div>
    </section>
  );
}
