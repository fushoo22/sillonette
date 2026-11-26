// Text and artwork checks shared by the extension (before sending) and the overlay (on receipt).
import { LIMITS } from "./types.ts";

function cp(...codes: number[]): string {
  return String.fromCodePoint(...codes);
}
// Characters removed: controls, bidi overrides/isolates, BOM.
const DROP = new RegExp("[\\p{Cc}" + cp(0x061c, 0x200e, 0x200f) + cp(0x202a) + "-" + cp(0x202e) + cp(0x2066) + "-" + cp(0x2069) + cp(0xfeff) + "]", "gu");
const SPACES = new RegExp("[\\s" + cp(0x85, 0x2028, 0x2029) + "]+", "gu");

/** Unicode NFC, whitespace collapsed, invisible and direction-changing characters removed. */
export function cleanText(s: string): string {
  return s.normalize("NFC").replace(SPACES, " ").replace(DROP, "").replace(/ {2,}/g, " ").trim();
}

export function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Truncate to max code points (never splits a surrogate pair). */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function allowedArtHost(host: string, patterns: readonly string[]): boolean {
  host = host.toLowerCase();
  return patterns.some((p) => (p.startsWith("*.") ? host.endsWith(p.slice(1)) && host.length > p.length - 1 : host === p));
}

/** An artwork URL the overlay may load: plain https, no credentials, port or fragment, allowed host. */
export function validArt(s: string, patterns: readonly string[]): boolean {
  if (s.length > LIMITS.maxArt || !s.startsWith("https://") || !/^[\x21-\x7e]+$/.test(s) || /["'<>\\^`{|}#]/.test(s)) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.startsWith("[")) return false;
  if (!s.toLowerCase().startsWith("https://" + u.hostname + "/") && s.toLowerCase() !== "https://" + u.hostname) return false;
  return allowedArtHost(u.hostname, patterns);
}
