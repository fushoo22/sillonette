// YouTube Music connector. Primary source: navigator.mediaSession (standard API,
// readable from the isolated content-script world); DOM selectors are a fallback
// and are kept in this single file.
import type { ArtworkLike, Connector, MediaLike, PageLike, TrackState } from "./types.ts";

export const SELECTORS = {
  media: "#movie_player video, video",
  barTitle: "ytmusic-player-bar .title",
  barByline: "ytmusic-player-bar .byline",
  barArt: "ytmusic-player-bar img.image, ytmusic-player-bar .thumbnail img",
  // YouTube Music's own progress bar: value / aria-valuemax in whole seconds of the current track.
  progress: "ytmusic-player-bar #progress-bar",
  // Ads: YouTube's player gets the "ad-showing" class (to be confirmed by the step-1 spike).
  ad: "#movie_player.ad-showing, .html5-video-player.ad-showing",
} as const;

export const ART_SIZE = 544;

function area(a: ArtworkLike): number {
  const m = /^(\d+)x(\d+)/.exec(a.sizes ?? "");
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

/** Ask Google's image CDN for a crisp but reasonable size (=w60-h60... -> =w544-h544...). */
export function normalizeArt(src: string): string {
  if (!/^https:\/\//.test(src)) return "";
  try {
    const u = new URL(src);
    if (u.hostname.endsWith(".googleusercontent.com") || u.hostname.endsWith(".ggpht.com")) {
      // Only square sizes are rewritten: a 16:9 video thumbnail (=w320-h180) keeps its own shape
      // and the overlay crops it (object-fit: cover).
      return src.replace(/=w(\d+)-h(\d+)/, (m, w: string, h: string) => (w === h ? `=w${ART_SIZE}-h${ART_SIZE}` : m)).replace(/=s\d+(?=-|$)/, `=s${ART_SIZE}`);
    }
  } catch {
    return "";
  }
  return src;
}

export function bestArtwork(list: readonly ArtworkLike[]): string {
  let best: ArtworkLike | undefined;
  for (const a of list) if (a && typeof a.src === "string" && (!best || area(a) >= area(best))) best = a;
  return best ? normalizeArt(best.src) : "";
}

const finiteMs = (s: number) => (Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : 0);
const seconds = (v: string): number => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);

/** How far (s) the media clock may be from the player bar and still be the track's own clock. */
export const CLOCK_TOLERANCE_S = 1.5;

/**
 * Position and duration of the current track.
 * Recorded on the real site (Premium, 25/11/2026): with gapless playback the same <video> goes on
 * from one track to the next, so currentTime/duration span several tracks (e.g. 604 s / 632 s while
 * the player bar shows 1:49 / 2:02). YouTube Music's progress bar is then the only per-track truth.
 */
export function timing(page: PageLike, media: MediaLike): { dur: number; pos: number } {
  const barMax = seconds(page.attr(SELECTORS.progress, "aria-valuemax"));
  const barPos = seconds(page.attr(SELECTORS.progress, "value"));
  let dur = finiteMs(media.duration);
  let pos = finiteMs(media.currentTime);
  if (barMax > 0 && Number.isFinite(barPos)) {
    dur = Math.round(barMax * 1000);
    // Keep the precise media clock when it is the track's own clock, else the bar (whole seconds).
    if (!(Math.abs(media.currentTime - barPos) <= CLOCK_TOLERANCE_S)) pos = Math.round(barPos * 1000);
  }
  if (dur > 0 && pos > dur + 2000) dur = 0; // inconsistent clock: better no bar than a stuck full bar
  return { dur, pos: dur > 0 ? Math.min(pos, dur) : pos };
}

export const ytmusic: Connector = {
  id: "ytmusic",
  read(page: PageLike): TrackState | null {
    const media = page.media();
    const meta = page.metadata();
    let title = meta?.title ?? "";
    let artist = meta?.artist ?? "";
    let album = meta?.album ?? "";
    let art = meta ? bestArtwork(meta.artwork) : "";
    if (!title) {
      // Fallback: the player bar ("Artist • Album • Year").
      title = page.text(SELECTORS.barTitle);
      const parts = page.text(SELECTORS.barByline).split("•").map((s) => s.trim());
      artist = parts[0] ?? "";
      album = parts.length > 2 ? parts[1] ?? "" : "";
      art = normalizeArt(page.attr(SELECTORS.barArt, "src"));
    }
    if (!title.trim() || !media) return null;
    const { dur, pos } = timing(page, media);
    const rate = Number.isFinite(media.playbackRate) && media.playbackRate >= 0 && media.playbackRate <= 4 ? media.playbackRate : 1;
    return {
      state: media.paused || media.ended ? "paused" : "playing",
      title, artist, album, art, dur, pos, rate,
      ad: page.exists(SELECTORS.ad),
      // readyState 0 right after "emptied", or a seek in progress: the page mixes two items.
      ready: (media.readyState ?? 4) >= 1 && !media.seeking,
    };
  },
};
