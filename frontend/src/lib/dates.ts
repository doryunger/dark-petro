import { WEEK_DAYS } from "./constants";
import type { Filter } from "./types";

const DAY_MS = 86400000;

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayIndex(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromDayIndex(dayIndex(iso) + n);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function formatTime(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1000).toISOString().slice(11, 16)} UTC`;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function defaultFilter(today: string, sources: string[]): Filter {
  return { from: addDays(today, 1 - WEEK_DAYS), to: today, sources: [...sources] };
}

export function sliderRange(filter: Filter, minDate: string, maxDate: string): [number, number] {
  const low = dayIndex(minDate);
  const high = dayIndex(maxDate);
  return [clamp(dayIndex(filter.from), low, high), clamp(dayIndex(filter.to), low, high)];
}
