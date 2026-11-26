// WCAG 2.1 contrast of the overlay text (test helper: every skin default must be readable).
// The card background is the "bg" colour at "ba" % opacity over an unknown OBS scene:
// the worst case over a black and a white scene is kept.
import type { Theme } from "../../src/shared/config.ts";

export const MIN_CONTRAST = 4.5; // WCAG AA, normal text

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: RGB): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

export function ratio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** fg at alpha (0-100) over an opaque bg. */
export function over(fg: RGB, alpha: number, bg: RGB): RGB {
  const a = alpha / 100;
  return [0, 1, 2].map((i) => Math.round(fg[i]! * a + bg[i]! * (1 - a))) as RGB;
}

export interface Contrast {
  title: number; // main text (title)
  secondary: number; // artist / album / time (text at 74 %)
  min: number;
  ok: boolean;
}

export function themeContrast(t: Pick<Theme, "tx" | "bg" | "ba">): Contrast {
  const tx = rgb(t.tx), bg = rgb(t.bg);
  const scenes: RGB[] = t.ba >= 100 ? [bg] : [[0, 0, 0], [255, 255, 255]];
  let title = Infinity, secondary = Infinity;
  for (const scene of scenes) {
    const card = over(bg, t.ba, scene);
    title = Math.min(title, ratio(tx, card));
    secondary = Math.min(secondary, ratio(over(tx, 74, card), card));
  }
  const min = Math.min(title, secondary);
  return { title, secondary, min, ok: min >= MIN_CONTRAST };
}
