// Turns what the YouTube Music tab reports into the track event the overlay shows:
// texts cleaned and bounded, numbers clamped, artwork kept only from the allowed hosts.
import type { TrackState } from "../content/types.ts";
import type { StreamEvent } from "../shared/types.ts";
import { DEFAULT_ART_HOSTS, LIMITS } from "../shared/types.ts";
import { cleanText, truncate, validArt } from "../shared/clean.ts";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const int = (n: number, lo: number, hi: number) => clamp(Math.round(Number.isFinite(n) ? n : 0), lo, hi);
const text = (s: string) => truncate(cleanText(s ?? ""), LIMITS.maxText);

/** at: when the tab reported this state (pos was true then); now: time of sending. */
export function trackEvent(t: TrackState | null, at: number, now: number): StreamEvent {
  const title = t ? text(t.title) : "";
  if (!t || title === "") return { v: 1, state: "idle", now };
  const dur = int(t.dur, 0, LIMITS.maxDuration);
  return {
    v: 1, state: t.state, title, artist: text(t.artist), album: text(t.album),
    art: t.art && validArt(t.art, DEFAULT_ART_HOSTS) ? t.art : "",
    dur, pos: int(t.pos, 0, dur > 0 ? dur : LIMITS.maxDuration),
    rate: clamp(Number.isFinite(t.rate) ? t.rate : 1, 0, LIMITS.maxRate), at, now,
  };
}
