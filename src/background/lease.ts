// "One source at a time", decided inside the extension, for the tabs of this browser:
//  - the first tab that plays takes the lease; another playing tab is refused (E10) and waits;
//  - the lease is released when its tab pauses, stops, closes, or is silent for LEASE_MS
//    (a playing tab reports at least every 20 s); a refused tab that still plays takes over at once;
//  - what is shown is the last accepted state ("last writer"), forgotten after IDLE_MS of silence.
// Pure functions on a plain JSON object, kept in storage.session (the service worker may restart).
import type { TrackState } from "../content/types.ts";

export const LEASE_MS = 45_000;
export const IDLE_MS = 75_000;

export interface TabEntry {
  track: TrackState | null; // latest state reported by the tab (null = nothing playing)
  at: number; // local time of that report (ms)
}

export interface Lease {
  tabs: Record<string, TabEntry>;
  owner: string | null; // tab that holds the lease
  shown: string | null; // tab whose state the overlay shows (last writer)
}

export const emptyLease = (): Lease => ({ tabs: {}, owner: null, shown: null });

const playing = (e: TabEntry | undefined, now: number) => !!e && e.track?.state === "playing" && now - e.at < LEASE_MS;

/** Storage may hold anything (older version, manual edit): keep only what has the right shape. */
export function cleanLease(x: unknown): Lease {
  const out = emptyLease();
  if (typeof x !== "object" || x === null) return out;
  const o = x as Record<string, unknown>;
  if (typeof o.tabs === "object" && o.tabs !== null) {
    for (const [k, v] of Object.entries(o.tabs as Record<string, unknown>)) {
      const e = v as Partial<TabEntry> | null;
      if (/^\d{1,10}$/.test(k) && e && typeof e.at === "number" && (e.track === null || typeof e.track === "object")) out.tabs[k] = { track: e.track ?? null, at: e.at };
    }
  }
  out.owner = typeof o.owner === "string" && o.owner in out.tabs ? o.owner : null;
  out.shown = typeof o.shown === "string" && o.shown in out.tabs ? o.shown : null;
  return out;
}

/** Releases an expired lease and hands it to the most recent tab that still plays. */
function settle(l: Lease, now: number): Lease {
  let { owner, shown } = l;
  if (owner !== null && !playing(l.tabs[owner], now)) owner = null;
  if (owner === null) {
    let best: string | null = null;
    for (const [k, e] of Object.entries(l.tabs)) if (playing(e, now) && (best === null || e.at > l.tabs[best]!.at)) best = k;
    if (best !== null) owner = shown = best;
  }
  return { tabs: l.tabs, owner, shown };
}

/** A tab reports its state (track null = nothing plays there any more). */
export function report(l: Lease, tab: number, track: TrackState | null, now: number): Lease {
  const k = String(tab);
  const tabs = { ...l.tabs, [k]: { track, at: now } };
  let { owner, shown } = settle({ ...l, tabs: l.tabs }, now);
  const free = owner === null || owner === k;
  if (track?.state === "playing") {
    if (free) owner = shown = k; // otherwise refused: E10 while it keeps playing
  } else if (track) {
    // paused: shown when nobody else holds the lease; releases the lease it held
    if (free) shown = k;
    if (owner === k) owner = null;
  } else {
    if (owner === k) owner = null;
    if (shown === k) shown = null;
  }
  return settle({ tabs, owner, shown }, now);
}

/** A tab was closed: forget it, release what it held. */
export function removeTab(l: Lease, tab: number, now: number): Lease {
  const k = String(tab);
  if (!(k in l.tabs)) return l;
  const { [k]: _gone, ...tabs } = l.tabs;
  return settle({ tabs, owner: l.owner === k ? null : l.owner, shown: l.shown === k ? null : l.shown }, now);
}

/** What the overlay should show now, and how many tabs are refused (E10). */
export function view(l: Lease, now: number): { shown: TabEntry | null; conflicts: number } {
  const s = settle(l, now);
  let conflicts = 0;
  for (const [k, e] of Object.entries(s.tabs)) if (k !== s.owner && playing(e, now)) conflicts++;
  const e = s.shown !== null ? s.tabs[s.shown] : undefined;
  const shown = e && e.track && now - e.at < IDLE_MS ? e : null;
  return { shown, conflicts };
}
