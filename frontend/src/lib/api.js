export async function fetchMetadata() {
  const response = await fetch("/metadata");
  if (!response.ok) throw new Error(`metadata ${response.status}`);
  return response.json();
}
