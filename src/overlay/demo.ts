// Demo mode (#demo=1, overlay opened in a browser): fake tracks, no network at all.
// Titles are obviously fictitious; the artworks are the SVG files of demo/.
import type { NpEvent } from "../shared/types.ts";

const TRACKS = [
  { title: "Nuage pêche", artist: "Les Démos de Sillonette", album: "Démo", art: "demo/art-1.svg", dur: 184_000 },
  { title: "Ciel de beurre (version très longue pour tester le défilement)", artist: "Studio Démo", album: "Démo", art: "demo/art-2.svg", dur: 241_000 },
  { title: "Framboise", artist: "Sillonette & co", album: "Démo", art: "demo/art-3.svg", dur: 158_000 },
];

export function demoEvent(i: number, now: number, state: "playing" | "paused" = "playing"): NpEvent {
  const t = TRACKS[i % TRACKS.length]!;
  return { v: 1, state, ...t, pos: Math.round(t.dur * 0.3), rate: 1, at: now, now };
}

export function startDemo(onEvent: (ev: NpEvent) => void, periodMs = 9000): () => void {
  let i = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const first = () => {
    if (stopped) return;
    onEvent(demoEvent(i, Date.now()));
    timer = setInterval(() => onEvent(demoEvent(++i, Date.now())), periodMs);
  };
  // A progress transition started while the page is still loading never runs in Chromium
  // (the bar would show full): send the first track once the page is loaded and painted.
  if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") first();
  else if (document.readyState === "complete") requestAnimationFrame(() => requestAnimationFrame(first));
  else window.addEventListener("load", () => requestAnimationFrame(() => requestAnimationFrame(first)), { once: true });
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
