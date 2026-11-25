const KEY = "dark-petro-tour-seen";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function tourSeen(store: Store | null = browserStore()): boolean {
  try {
    return store?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(store: Store | null = browserStore()): void {
  try {
    store?.setItem(KEY, "1");
  } catch {
    return;
  }
}

export function tourRequested(search: string): boolean {
  return new URLSearchParams(search).get("tour") === "1";
}

export function shouldStartTour(search: string, store?: Store | null): boolean {
  return tourRequested(search) || !tourSeen(store);
}
