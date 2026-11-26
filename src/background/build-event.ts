// The event sent to OBS, built from the state shared between tabs (lease) and the settings. Used by the
// background (sent to OBS) and by the options page's live preview (shown locally only, never sent).
import { encodeTheme, type Theme } from "../shared/config.ts";
import type { OverlayEvent } from "../shared/event.ts";
import { cleanLease, view } from "./lease.ts";
import { trackEvent } from "./track.ts";

export function buildEvent(lease: unknown, theme: Theme, now: number): { ev: OverlayEvent; conflicts: number } {
  const v = view(cleanLease(lease), now);
  return {
    ev: {
      v: 1,
      np: v.shown ? trackEvent(v.shown.track, v.shown.at, now) : { v: 1, state: "idle", now },
      theme: encodeTheme(theme),
      err: v.conflicts > 0 ? "E10" : "",
    },
    conflicts: v.conflicts,
  };
}
