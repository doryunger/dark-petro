import { WEEK_DAYS } from "./constants.js";

const DAY_MS = 86400000;

export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function dayIndex(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayIndex(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return fromDayIndex(dayIndex(iso) + n);
}

export function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function formatTime(epochSeconds) {
  return `${new Date(epochSeconds * 1000).toISOString().slice(11, 16)} UTC`;
}

export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

export function defaultFilter(today, sources) {
  return { from: addDays(today, 1 - WEEK_DAYS), to: today, sources: [...sources] };
}

export function sliderRange(filter, minDate, maxDate) {
  const low = dayIndex(minDate);
  const high = dayIndex(maxDate);
  return [clamp(dayIndex(filter.from), low, high), clamp(dayIndex(filter.to), low, high)];
}
