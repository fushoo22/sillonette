// Event built from the tabs' shared state: the same function feeds OBS (background) and the options
// page's live preview, so both always show the same thing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvent } from "../../src/background/build-event.ts";
import { emptyLease, report } from "../../src/background/lease.ts";
import { decodeTheme, normalizeTheme } from "../../src/shared/config.ts";
import { parseOverlayEvent } from "../../src/shared/event.ts";

const track = (title, state = "playing") => ({ state, title, artist: "A", album: "", art: "https://lh3.googleusercontent.com/x=w544", dur: 200000, pos: 1000, rate: 1, ad: false, ready: true });

test("live preview event = OBS event: idle, track, E10, settings, valid for the overlay", () => {
  const th = normalizeTheme({ sk: "neon", nt: 10 });
  let { ev, conflicts } = buildEvent(undefined, th, 1000);
  assert.equal(ev.np.state, "idle");
  assert.equal(conflicts, 0);
  assert.deepEqual(decodeTheme(ev.theme), th);
  let l = report(emptyLease(), 1, track("Un"), 1000);
  ({ ev } = buildEvent(l, th, 1500));
  assert.deepEqual([ev.np.state, ev.np.title, ev.err], ["playing", "Un", ""]);
  l = report(l, 2, track("Deux"), 1600);
  ({ ev, conflicts } = buildEvent(l, th, 1700));
  assert.deepEqual([ev.np.title, ev.err, conflicts], ["Un", "E10", 1]);
  assert.deepEqual(Object.keys(ev).sort(), ["err", "np", "theme", "v"]);
  assert.ok(parseOverlayEvent(JSON.parse(JSON.stringify(ev))), "accepted by the overlay");
  const bad = buildEvent(report(emptyLease(), 1, { ...track("X"), art: "https://evil.example/a.png" }, 1), th, 2).ev;
  assert.equal(bad.np.art, "", "cover only from the allowed hosts");
});
