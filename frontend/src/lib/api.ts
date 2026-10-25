import type { Meta } from "./types";

export async function fetchMetadata(): Promise<Meta> {
  const response = await fetch("/metadata");
  if (!response.ok) throw new Error(`metadata ${response.status}`);
  return response.json();
}
