import { dayIndex, formatDate, fromDayIndex } from "../lib/dates";

interface Props {
  min: string;
  max: string;
  value: [number, number];
  onChange: (next: [number, number]) => void;
}

export default function RangeSlider(props: Props) {
  const low = () => dayIndex(props.min);
  const high = () => dayIndex(props.max);
  const span = () => Math.max(high() - low(), 1);
  const start = () => props.value[0];
  const end = () => props.value[1];
  return (
    <div class="range">
      <div class="range-limits">
        <span>{formatDate(props.min)}</span>
        <span>{formatDate(props.max)}</span>
      </div>
      <div class="range-track" style={{ "--start": (start() - low()) / span(), "--end": (end() - low()) / span() }}>
        <span class="range-fill" />
        <input
          class="range-input"
          type="range"
          min={low()}
          max={high()}
          value={start()}
          aria-label="From"
          style={{ "z-index": start() >= high() ? 4 : 2 }}
          onInput={(e) => props.onChange([Math.min(Number(e.currentTarget.value), end()), end()])}
        />
        <input
          class="range-input"
          type="range"
          min={low()}
          max={high()}
          value={end()}
          aria-label="To"
          style={{ "z-index": 3 }}
          onInput={(e) => props.onChange([start(), Math.max(Number(e.currentTarget.value), start())])}
        />
      </div>
      <div class="range-label">
        {formatDate(fromDayIndex(start()))} – {formatDate(fromDayIndex(end()))}
      </div>
    </div>
  );
}
