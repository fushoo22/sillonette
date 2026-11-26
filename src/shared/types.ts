// What the overlay shows: the track event carried by the obs-browser event (see event.ts).

/** Something plays (or is paused). */
export interface NpEvent {
  v: 1;
  state: "playing" | "paused";
  title: string;
  artist: string;
  album: string;
  art: string;
  dur: number;
  pos: number;
  rate: number;
  /** time (ms, extension clock) at which pos was true */
  at: number;
  /** time (ms, extension clock) at which the event was sent */
  now: number;
}

/** Nothing to show. */
export interface IdleEvent {
  v: 1;
  state: "idle";
  now: number;
}

export type StreamEvent = NpEvent | IdleEvent;

/** Error codes shown by the overlay. E10: another YouTube Music tab already plays. */
export const ERROR_CODES = ["E10"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const LIMITS = {
  maxText: 200,
  maxArt: 512,
  maxDuration: 24 * 60 * 60 * 1000,
  posSlack: 5000,
  maxRate: 4,
} as const;

// "*.googleusercontent.com": YouTube Music also serves video-clip thumbnails from yt3.googleusercontent.com
// (seen in navigator.mediaSession on the real site, 25/11/2026). A wildcard never matches the apex.
export const DEFAULT_ART_HOSTS = ["lh3.googleusercontent.com", "*.googleusercontent.com", "i.ytimg.com", "yt3.ggpht.com", "*.ggpht.com"];
