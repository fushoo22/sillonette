// The JavaScript event that OBS hands to the overlay.
// Extension -> obs-websocket (CallVendorRequest "obs-browser" / "emit_event") -> obs-browser runs
// `window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: <event_data> }))` in EVERY browser source.
// Any obs-websocket client can emit the same event: the overlay trusts nothing and validates it all.
import type { NpEvent, StreamEvent } from "./types.ts";
import { DEFAULT_ART_HOSTS, LIMITS } from "./types.ts";
import { cleanText, truncate, validArt } from "./clean.ts";
import { decodeTheme, type Lang, type Theme } from "./config.ts";

/** obs-browser pastes this name, unescaped, into JavaScript (browser-app.cpp): keep it a constant of [a-z-]. */
export const EVENT_NAME = "sillonette";
export const EVENT_VERSION = 1;
/** Bigger events are ignored (a real one is about 1 KB). */
export const MAX_EVENT_BYTES = 8192;

export type OverlayErr = "" | "E10";

/** event_data of the obs-browser emit_event request. */
export interface OverlayEvent {
  v: 1;
  np: StreamEvent;
  /** Overlay settings, encoded by encodeTheme. A local file loaded by OBS has no URL fragment, so they
   *  travel with every event. A string, because obs-browser passes
   *  event_data through obs_data (libobs obs-data.c), which silently DROPS every array item that is not
   *  an object: the theme's "sh" list (["art","artist","prog"]) arrived empty in a real OBS 33. */
  theme: string;
  err: OverlayErr;
}

/** The event as the overlay uses it, after validation. */
export interface ParsedEvent {
  np: StreamEvent;
  theme: Theme;
  err: OverlayErr;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const text = (v: unknown) => (typeof v === "string" ? truncate(cleanText(v), LIMITS.maxText) : "");

/** Strict copy of a track event: unknown keys dropped, texts cleaned, numbers bounded, artwork allow-listed. */
export function cleanNp(x: unknown): StreamEvent | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || !num(o.now)) return null;
  if (o.state === "idle") return { v: 1, state: "idle", now: o.now };
  if (o.state !== "playing" && o.state !== "paused") return null;
  if (!num(o.dur) || !num(o.pos) || !num(o.rate) || !num(o.at)) return null;
  const title = text(o.title);
  if (title === "") return null;
  const dur = clamp(Math.round(o.dur), 0, LIMITS.maxDuration);
  const art = typeof o.art === "string" && validArt(o.art, DEFAULT_ART_HOSTS) ? o.art : "";
  const np: NpEvent = {
    v: 1, state: o.state, title, artist: text(o.artist), album: text(o.album), art, dur,
    pos: clamp(Math.round(o.pos), 0, dur > 0 ? dur + LIMITS.posSlack : LIMITS.maxDuration),
    rate: clamp(o.rate, 0, LIMITS.maxRate), at: o.at, now: o.now,
  };
  return np;
}

/** Validates event_data as received by the overlay. Never throws; null = ignore the event. */
export function parseOverlayEvent(x: unknown, fallbackLang: Lang = "fr"): ParsedEvent | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  let size = 0;
  try {
    size = JSON.stringify(x).length;
  } catch {
    return null;
  }
  if (size > MAX_EVENT_BYTES) return null;
  const o = x as Record<string, unknown>;
  if (o.v !== EVENT_VERSION) return null;
  const np = cleanNp(o.np);
  if (!np) return null;
  return { np, theme: decodeTheme(typeof o.theme === "string" ? o.theme : "", fallbackLang), err: o.err === "E10" ? "E10" : "" };
}
