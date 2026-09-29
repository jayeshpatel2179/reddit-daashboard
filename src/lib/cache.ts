// Short-lived, RAM-only cache of finished analyses. Nothing touches disk and
// everything disappears when the server restarts. Set CACHE_MINUTES=0 to disable.

import type { StreamEvent } from "@/lib/types";

const TTL_MS = Math.max(0, Number(process.env.CACHE_MINUTES ?? 10)) * 60_000;
const MAX_ENTRIES = 20;

type Entry = { expires: number; events: StreamEvent[] };
const g = globalThis as unknown as { __analysisCache?: Map<string, Entry> };
const store = (g.__analysisCache ??= new Map());

export function getCached(key: string): StreamEvent[] | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.events;
}

export function setCached(key: string, events: StreamEvent[]) {
  if (!TTL_MS) return;
  store.set(key, { expires: Date.now() + TTL_MS, events });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!);
}
