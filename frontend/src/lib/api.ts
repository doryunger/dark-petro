import { toActivityMatch } from "./entries";
import { activityImosUrl, activityUrl, trackUrl } from "./filters";
import type { ActivityMatch, ActivityRecord, Filter, Meta, TrackPoint } from "./types";

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

export async function fetchActivities(imo: string, filter: Filter, signal?: AbortSignal): Promise<ActivityMatch[]> {
  const response = await fetch(activityUrl(imo, filter), { signal });
  if (!response.ok) throw new Error(`activities ${response.status}`);
  const payload = (await response.json()) as { activities: ActivityRecord[] };
  return payload.activities.map(toActivityMatch);
}

export async function fetchActivityImos(filter: Pick<Filter, "from" | "to">, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(activityImosUrl(filter), { signal });
  if (!response.ok) throw new Error(`activity imos ${response.status}`);
  const payload = (await response.json()) as { imos: string[] };
  return payload.imos;
}
