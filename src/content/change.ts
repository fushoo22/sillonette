// Decides when a state is worth sending: new track, play/pause,
// jump of more than 2 s, rate change, plus a heartbeat every 20 s while playing.
// A paused tab goes quiet (no heartbeat): the background turns it idle after 75 s.
import type { TrackState } from "./types.ts";

export const HEARTBEAT_MS = 20_000;
export const JUMP_MS = 2000;
/**
 * A new track is sent once it has been stable for this long. Real site (25/11/2026): the album and
 * the full artwork list arrive 100-450 ms after the title, and on a gapless change the player bar
 * still shows the old position for ~180 ms.
 */
export const SETTLE_MS = 400;

export interface Sent {
  track: TrackState | null;
  at: number; // local time of the send
}

export function trackKey(t: TrackState): string {
  return JSON.stringify([t.title, t.artist, t.album, t.art]);
}

export function shouldSend(prev: Sent | null, cur: TrackState | null, now: number): boolean {
  if (!prev) return cur !== null;
  const p = prev.track;
  if (!cur || !p) return (cur === null) !== (p === null);
  if (trackKey(cur) !== trackKey(p) || cur.state !== p.state || cur.rate !== p.rate || cur.dur !== p.dur) return true;
  if (cur.state !== "playing") return false;
  const expected = p.pos + (now - prev.at) * p.rate;
  if (Math.abs(cur.pos - expected) > JUMP_MS) return true;
  return now - prev.at >= HEARTBEAT_MS;
}

/** Holds a new track back until it has stopped changing (see SETTLE_MS). */
export class Settler {
  private key = "";
  private since = 0;

  /** Milliseconds still to wait before cur may be sent (0: send now). */
  wait(sent: TrackState | null, cur: TrackState | null, now: number): number {
    if (!cur || (sent && trackKey(sent) === trackKey(cur))) {
      this.key = "";
      return 0;
    }
    const k = trackKey(cur);
    if (k !== this.key) {
      this.key = k;
      this.since = now;
    }
    return Math.max(0, this.since + SETTLE_MS - now);
  }
}

/**
 * Remembers the last ads seen. On the real site, between two videos YouTube removes the
 * "ad-showing" class while navigator.mediaSession still describes the ad (recorded 25/11/2026):
 * without this memory the ad title leaked to the overlay as a paused track.
 */
export class AdMemory {
  private keys: string[] = [];

  classify(cur: TrackState | null): TrackState | null {
    if (!cur) return cur;
    const k = cur.title + "\u0000" + cur.artist;
    if (cur.ad) {
      if (!this.keys.includes(k)) this.keys = [k, ...this.keys].slice(0, 20);
      return cur;
    }
    return this.keys.includes(k) ? { ...cur, ad: true } : cur;
  }
}

/** While an ad plays, report the previous real track as paused (never the ad itself). */
export function maskAd(cur: TrackState | null, lastReal: TrackState | null): TrackState | null {
  if (!cur || !cur.ad) return cur;
  return lastReal ? { ...lastReal, state: "paused", ad: false } : null;
}

export type Step = { send: true; track: TrackState | null } | { send: false; recheckIn?: number };

/** The whole decision of the content script, as a pure state machine (replayed by the tests). */
export class Tracker {
  private ads = new AdMemory();
  private settler = new Settler();
  private last: Sent | null = null;
  private lastReal: TrackState | null = null;

  /** Forget what was last sent, so that the current state goes out again (ads stay remembered). */
  resend(): void {
    this.last = null;
  }

  step(read: TrackState | null, now: number): Step {
    let cur = this.ads.classify(read);
    // Between two items (after "emptied", during a seek) the page mixes the old and the new one.
    if (cur && !cur.ready) return { send: false, recheckIn: 250 };
    if (cur && !cur.ad) this.lastReal = cur;
    cur = maskAd(cur, this.lastReal);
    const wait = this.settler.wait(this.last?.track ?? null, cur, now);
    if (wait > 0) return { send: false, recheckIn: wait + 20 };
    if (!shouldSend(this.last, cur, now)) return { send: false };
    this.last = { track: cur, at: now };
    return { send: true, track: cur };
  }
}
