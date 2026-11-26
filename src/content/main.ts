// Content script (isolated world) on music.youtube.com. It only reads what is playing and tells the
// background; it never sees the extension's settings (storage is closed to it where the browser allows).
import { api } from "../shared/api.ts";
import { ytmusic } from "./ytmusic.ts";
import { Tracker } from "./change.ts";
import { domPage } from "./page.ts";
import type { TrackState } from "./types.ts";

const page = domPage(document, navigator);
const tracker = new Tracker();
let timer: ReturnType<typeof setInterval> | undefined;
let soon: ReturnType<typeof setTimeout> | undefined;

function check(): void {
  let cur: TrackState | null;
  try {
    cur = ytmusic.read(page);
  } catch {
    cur = null;
  }
  const step = tracker.step(cur, Date.now());
  if (!step.send) {
    if (step.recheckIn !== undefined) recheck(step.recheckIn);
    return;
  }
  api.runtime.sendMessage({ type: "track", track: step.track }).catch(() => {
    // Extension reloaded or updated: this script is orphaned, stop quietly.
    if (!api.runtime?.id) stop();
  });
}

function recheck(ms: number): void {
  clearTimeout(soon);
  soon = setTimeout(check, ms);
}

function stop(): void {
  clearInterval(timer);
  clearTimeout(soon);
  for (const ev of EVENTS) document.removeEventListener(ev, onMediaEvent, true);
}

const EVENTS = ["play", "playing", "pause", "seeked", "ratechange", "loadedmetadata", "durationchange", "emptied", "waiting", "ended"];
function onMediaEvent(): void {
  recheck(50); // let YouTube Music update mediaSession and the player bar first
}

// After an OBS or browser restart the background asks for the current state again.
api.runtime.onMessage.addListener((msg, from) => {
  if (from.id === api.runtime.id && (msg as { type?: unknown } | null)?.type === "sillonette-refresh") {
    tracker.resend();
    check();
  }
  return false;
});

for (const ev of EVENTS) document.addEventListener(ev, onMediaEvent, true); // media events do not bubble: capture
// 2 Hz: a gapless track change fires no media event at all (real site), only polling sees it.
timer = setInterval(check, 500);
check();

// Leaving the page (tab closed or navigated away): say so at once, best effort. The background also
// listens to tabs.onRemoved, which is the reliable path when the tab is closed.
window.addEventListener("pagehide", () => {
  api.runtime.sendMessage({ type: "track", track: null }).catch(() => undefined);
});
