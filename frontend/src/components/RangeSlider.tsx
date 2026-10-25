import type { CSSProperties } from "react";
import { dayIndex, formatDate, fromDayIndex } from "../lib/dates";

interface Props {
  min: string;
  max: string;
  value: [number, number];
  onChange: (next: [number, number]) => void;
}

export default function RangeSlider({ min, max, value, onChange }: Props) {
  const low = dayIndex(min);
  const high = dayIndex(max);
  const span = Math.max(high - low, 1);
  const [start, end] = value;
  const style = { "--start": (start - low) / span, "--end": (end - low) / span } as CSSProperties;
  return (
    <div className="range">
      <div className="range-limits">
        <span>{formatDate(min)}</span>
        <span>{formatDate(max)}</span>
      </div>
      <div className="range-track" style={style}>
        <span className="range-fill" />
        <input
          className="range-input"
          type="range"
          min={low}
          max={high}
          value={start}
          aria-label="From"
          style={{ zIndex: start >= high ? 4 : 2 }}
          onChange={(e) => onChange([Math.min(Number(e.target.value), end), end])}
        />
        <input
          className="range-input"
          type="range"
          min={low}
          max={high}
          value={end}
          aria-label="To"
          style={{ zIndex: 3 }}
          onChange={(e) => onChange([start, Math.max(Number(e.target.value), start)])}
        />
      </div>
      <div className="range-label">
        {formatDate(fromDayIndex(start))} – {formatDate(fromDayIndex(end))}
      </div>
    </div>
  );
}
