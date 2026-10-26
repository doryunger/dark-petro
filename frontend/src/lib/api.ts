import { trackUrl } from "./filters";
import type { Filter, Meta, TrackPoint } from "./types";

export async function fetchMetadata(): Promise<Meta> {
  const response = await fetch("/metadata");
  if (!response.ok) throw new Error(`metadata ${response.status}`);
  return response.json();
}

export async function fetchTrack(imo: string, filter: Filter, signal?: AbortSignal): Promise<TrackPoint[]> {
  const response = await fetch(trackUrl(imo, filter), { signal });
  if (!response.ok) throw new Error(`track ${response.status}`);
  return (await response.json()).points;
}
