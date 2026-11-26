// Single decoder of the overlay settings, shared by the popup, the background and the overlay.
// Golden rule: an unknown or invalid value silently falls back to the skin default; unknown keys
// are ignored.
import { ERROR_CODES, type ErrorCode } from "./types.ts";

export type Layout = "h" | "c" | "v";
export type Show = "art" | "artist" | "album" | "prog" | "time" | "mascot";
export type Anim = "fade" | "slide" | "pop" | "none";
export type TrackChange = "auto" | "fade" | "slide" | "none";
export type PauseMode = "show" | "dim" | "hide";
export type IdleMode = "hide" | "wait";
export type ArtShape = "square" | "rounded" | "round";
export type Lang = "fr" | "en";

export interface Theme {
  v: 1;
  sk: string; // skin id
  ly: Layout;
  ac: string; // accent colour  #rrggbb
  tx: string; // text colour
  bg: string; // background colour
  ba: number; // background opacity 0-100
  ft: string; // title font id
  sc: number; // scale 50-200 (%)
  rd: number; // corner radius 0-48 (px at 100 %)
  sh: Show[]; // visible parts ("mascot": skins that have one)
  an: Anim; // entrance animation (and track change when tc = auto)
  tc: TrackChange; // track change animation, "auto" = same as the entrance
  mq: 0 | 1; // scroll long titles
  pa: PauseMode;
  pt: number; // seconds before hiding when paused (pa = hide), 0-600
  id: IdleMode;
  al: "l" | "r";
  rm: 0 | 1; // force reduced motion
  lg: Lang;
  as: ArtShape;
  sd: 0 | 1 | 2; // shadow
}

export interface SkinInfo {
  id: string;
  tier: "free";
  /** Body text font (id in FONTS); the title font is the "ft" setting. */
  body: string;
  defaults: Theme;
}

/** Self-hosted OFL fonts (src/fonts/README.txt). Ids are part of the settings format: never rename. */
export const FONTS: Record<string, string> = {
  mochiy: "'Mochiy Pop One', 'Nunito Variable', system-ui, sans-serif",
  nunito: "'Nunito Variable', system-ui, sans-serif",
  inter: "'Inter Variable', system-ui, sans-serif",
  serif: "'Fraunces Variable', Georgia, serif",
  grotesk: "'Space Grotesk Variable', system-ui, sans-serif",
  pixel: "'Pixelify Sans Variable', ui-monospace, monospace",
  mono: "'Space Mono', ui-monospace, monospace",
  hand: "'Caveat', 'Nunito Variable', cursive",
};

const BASE: Theme = {
  v: 1, sk: "studio", ly: "h", ac: "#a3216b", tx: "#203856", bg: "#fffaf3", ba: 90, ft: "mochiy",
  sc: 100, rd: 18, sh: ["art", "artist", "prog"], an: "slide", tc: "auto", mq: 1, pa: "dim", pt: 10, id: "hide",
  al: "l", rm: 0, lg: "fr", as: "rounded", sd: 1,
};

function skin(id: string, body: string, d: Partial<Theme>): SkinInfo {
  return { id, tier: "free", body, defaults: { ...BASE, ...d, sk: id } };
}

/** Skin registry. Order = order shown in the popup. */
export const SKINS: Record<string, SkinInfo> = {
  studio: skin("studio", "nunito", {}),
  neon: skin("neon", "grotesk", { ac: "#ff4fd8", tx: "#8af7ff", bg: "#0c0a24", ba: 88, ft: "grotesk", rd: 12, an: "fade", sd: 2 }),
  vinyle: skin("vinyle", "serif", { ac: "#d4ae66", tx: "#f6ecd8", bg: "#1c1416", ba: 94, ft: "serif", rd: 14, as: "round" }),
  retro: skin("retro", "inter", { ac: "#ffb347", tx: "#fff0fa", bg: "#2b1055", ba: 94, ft: "grotesk", rd: 6, as: "square" }),
  arcade: skin("arcade", "mono", { ac: "#ffd23f", tx: "#ffffff", bg: "#1b2fb5", ba: 100, ft: "pixel", rd: 0, as: "square", an: "pop", sd: 2 }),
  lofi: skin("lofi", "nunito", { ac: "#d9577f", tx: "#203856", bg: "#fff1e2", ba: 94, ft: "nunito", rd: 30, sh: ["art", "artist", "prog", "mascot"], an: "fade" }),
};

export const MAX_ENCODED = 1500;
const SHOW: readonly Show[] = ["art", "artist", "album", "prog", "time", "mascot"];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], def: T): T {
  return allowed.includes(v as T) ? (v as T) : def;
}
function int(v: unknown, min: number, max: number, def: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : def;
}
function hex(v: unknown, def: string): string {
  if (typeof v !== "string" || !HEX.test(v)) return def;
  const s = v.toLowerCase();
  return s.length === 4 ? "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s;
}

const own = (o: object, k: unknown): k is string => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

/** Registry lookup that ignores inherited keys ("constructor", "__proto__"...). */
export function skinInfo(id: unknown): SkinInfo {
  return own(SKINS, id) ? SKINS[id]! : SKINS.studio!;
}

/** Normalise any parsed object into a complete, valid Theme. */
export function normalizeTheme(input: unknown, fallbackLang: Lang = "fr"): Theme {
  const o = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const skin = skinInfo(o.sk);
  const d = { ...skin.defaults, lg: fallbackLang };
  let sh = d.sh;
  if (Array.isArray(o.sh)) {
    sh = SHOW.filter((k) => (o.sh as unknown[]).includes(k));
  }
  return {
    v: 1,
    sk: skin.id,
    ly: oneOf(o.ly, ["h", "c", "v"] as const, d.ly),
    ac: hex(o.ac, d.ac),
    tx: hex(o.tx, d.tx),
    bg: hex(o.bg, d.bg),
    ba: int(o.ba, 0, 100, d.ba),
    ft: own(FONTS, o.ft) ? o.ft : d.ft,
    sc: int(o.sc, 50, 200, d.sc),
    rd: int(o.rd, 0, 48, d.rd),
    sh,
    an: oneOf(o.an, ["fade", "slide", "pop", "none"] as const, d.an),
    tc: oneOf(o.tc, ["auto", "fade", "slide", "none"] as const, d.tc),
    mq: oneOf(o.mq, [0, 1] as const, d.mq),
    pa: oneOf(o.pa, ["show", "dim", "hide"] as const, d.pa),
    pt: int(o.pt, 0, 600, d.pt),
    id: oneOf(o.id, ["hide", "wait"] as const, d.id),
    al: oneOf(o.al, ["l", "r"] as const, d.al),
    rm: oneOf(o.rm, [0, 1] as const, d.rm),
    lg: oneOf(o.lg, ["fr", "en"] as const, d.lg),
    as: oneOf(o.as, ["square", "rounded", "round"] as const, d.as),
    sd: oneOf(o.sd, [0, 1, 2] as const, d.sd),
  };
}

function b64urlToText(s: string): string | null {
  if (s.length > MAX_ENCODED || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function textToB64url(t: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(t)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode encoded settings (the "theme" string of the event, or "s=" in a preview fragment). Never throws. */
export function decodeTheme(s: string | null | undefined, fallbackLang: Lang = "fr"): Theme {
  let parsed: unknown = {};
  if (s) {
    const text = b64urlToText(s);
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }
    }
  }
  return normalizeTheme(parsed, fallbackLang);
}

/** Encode only the values that differ from the skin defaults (short strings). The language is
 *  always written: without it the overlay follows the browser of OBS. */
export function encodeTheme(t: Theme): string {
  const d = skinInfo(t.sk).defaults;
  const out: Record<string, unknown> = { v: 1, sk: t.sk, lg: t.lg };
  for (const k of Object.keys(t) as (keyof Theme)[]) {
    if (k === "v" || k === "sk" || k === "lg") continue;
    if (JSON.stringify(t[k]) !== JSON.stringify(d[k])) out[k] = t[k];
  }
  return textToB64url(JSON.stringify(out));
}

export interface Fragment {
  demo: boolean;
  theme: Theme;
  er: boolean; // show error codes on the overlay (default on, "er=0" hides them on air)
  err: ErrorCode | null; // demo only: error code to show ("#demo=1&err=E10")
}

export function isErrorCode(x: unknown): x is ErrorCode {
  return typeof x === "string" && (ERROR_CODES as readonly string[]).includes(x);
}

export function langFromNavigator(nav: { language?: string } | undefined): Lang {
  return nav?.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Preview fragment of the overlay opened in a browser: "#demo=1&s=<b64url>&er=0&err=E10".
 *  (OBS loads the local file without any fragment: there the settings come with the events.) */
export function parseFragment(hash: string, fallbackLang: Lang = "fr"): Fragment {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const demo = p.get("demo") === "1";
  const err = p.get("err");
  return {
    demo,
    theme: decodeTheme(p.get("s"), fallbackLang),
    er: p.get("er") !== "0",
    err: demo && isErrorCode(err) ? err : null,
  };
}

/** Recommended size of the OBS browser source (px) for a layout and scale: the card,
 *  the error badge under it and the margins fit inside (checked by the end-to-end tests). */
export function sourceSize(t: Pick<Theme, "ly" | "sc">): { w: number; h: number } {
  const base = t.ly === "v" ? { w: 300, h: 460 } : t.ly === "c" ? { w: 800, h: 120 } : { w: 800, h: 200 };
  const up = (n: number) => Math.ceil((n * t.sc) / 100 / 10) * 10;
  return { w: up(base.w), h: up(base.h) };
}

/** "#rrggbb" + opacity (0-100) -> "rgba(r, g, b, a)". */
export function rgba(hexColor: string, alpha: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha) / 100})`;
}
