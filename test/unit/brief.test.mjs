// Overlay card visibility with a simulated clock: "a few seconds at each new track" (setting nt),
// pause delay (pa = hide, pt) against the extension's 5 s resend, settings changed live.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Overlay } from "../../src/overlay/render.ts";
import { normalizeTheme, decodeTheme, encodeTheme, withSkin, skinDefaults, BRIEF_DEFAULT, MAX_ENCODED, SKINS } from "../../src/shared/config.ts";

function fakeEl() {
  const attrs = new Map();
  const classes = new Set();
  return {
    textContent: "", dataset: {}, style: { setProperty() {}, transition: "", transform: "" }, offsetWidth: 0,
    ownerDocument: { defaultView: null },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c), toggle: (c, on) => (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k), getAttribute: (k) => attrs.get(k) ?? null,
    addEventListener() {},
  };
}
function setup(settings) {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let clock = 1_000_000;
  const els = Object.fromEntries(["root", "img", "title", "titleText", "artist", "album", "status", "fill", "cur", "dur"].map((k) => [k, fakeEl()]));
  const o = new Overlay(els, normalizeTheme(settings), () => clock);
  const advance = (ms) => { clock += ms; mock.timers.tick(ms); };
  const ev = (title, state = "playing") => ({ v: 1, state, title, artist: "A", album: "", art: "", dur: 300000, pos: 0, rate: 1, at: clock, now: clock });
  const visible = () => els.root.classList.contains("is-visible");
  return { o, els, advance, ev, visible, send: (e) => o.handle(e) };
}

test("a few seconds: shown at each new track, then hidden, resends do not extend it", (t) => {
  t.after(() => mock.timers.reset());
  const { advance, ev, visible, send, els } = setup({ nt: 10 });
  send(ev("Un"));
  assert.equal(visible(), true);
  for (let i = 0; i < 1; i++) { advance(5000); send(ev("Un")); } // the extension resends every 5 s
  assert.equal(visible(), true, "5 s: still shown");
  advance(4900);
  assert.equal(visible(), true, "9.9 s");
  advance(200);
  assert.equal(visible(), false, "10.1 s: hidden");
  assert.equal(els.root.dataset.state, "playing", "the state stays");
  advance(5000); send(ev("Un"));
  assert.equal(visible(), false, "same track: stays hidden");
  send(ev("Deux"));
  assert.equal(visible(), true, "next track: shown again");
  advance(10_100);
  assert.equal(visible(), false);
});

test("a few seconds: no comeback on resume after a pause, pause rules inside the window", (t) => {
  t.after(() => mock.timers.reset());
  const { advance, ev, visible, send, els } = setup({ nt: 10, pa: "dim" });
  send(ev("Un"));
  advance(3000);
  send(ev("Un", "paused"));
  assert.equal(visible(), true, "paused inside the window: dimmed, still shown");
  assert.equal(els.root.dataset.state, "paused");
  advance(8000);
  assert.equal(visible(), false, "window over while paused");
  send(ev("Un", "playing"));
  assert.equal(visible(), false, "resume: no comeback");
  // idle then the same title again: that is a new start, shown again
  send({ v: 1, state: "idle", now: 0 });
  send(ev("Un"));
  assert.equal(visible(), true);
});

test("a few seconds: settings changed live (switched on, off, other duration)", (t) => {
  t.after(() => mock.timers.reset());
  const { o, advance, ev, visible, send } = setup({});
  send(ev("Un"));
  advance(60_000);
  assert.equal(visible(), true, "nt = 0: always shown");
  o.setTheme(normalizeTheme({ nt: 3 }));
  assert.equal(visible(), true, "switched on: shown for 3 s from now");
  advance(3100);
  assert.equal(visible(), false);
  o.setTheme(normalizeTheme({ nt: 0 }));
  assert.equal(visible(), true, "switched off: shown at once");
});

test("pause delay counts from the first paused event, not from the 5 s resends", (t) => {
  t.after(() => mock.timers.reset());
  const { advance, ev, visible, send, els } = setup({ pa: "hide", pt: 12 });
  send(ev("Un"));
  send(ev("Un", "paused"));
  for (let i = 0; i < 2; i++) { advance(5000); send(ev("Un", "paused")); }
  assert.equal(visible(), true, "10 s");
  advance(2100);
  assert.equal(visible(), false, "12 s: hidden even though events kept coming");
  assert.equal(els.root.dataset.state, "paused");
  advance(5000); send(ev("Un", "paused"));
  assert.equal(visible(), false, "stays hidden");
  send(ev("Un"));
  assert.equal(visible(), true, "resume shows it again (nt = 0)");
  send(ev("Un", "paused"));
  assert.equal(visible(), true, "a new pause starts a new delay");
  mock.timers.reset();
  const z = setup({ pa: "hide", pt: 0 });
  z.send(z.ev("X", "paused"));
  assert.equal(z.visible(), false, "pt = 0: hidden at once");
});

test("settings: nt and er, golden rule, defaults unchanged, size bound", () => {
  for (const s of Object.values(SKINS)) {
    assert.equal(s.defaults.nt, 0, "every skin: always shown by default");
    assert.equal(s.defaults.er, 1, "every skin: error codes shown by default");
  }
  assert.equal(normalizeTheme({ nt: 10 }).nt, 10);
  for (const bad of [1, 2, 61, 2.5, "10", -1, null]) assert.equal(normalizeTheme({ nt: bad }).nt, 0, String(bad));
  assert.equal(normalizeTheme({ nt: 3 }).nt, 3);
  assert.equal(normalizeTheme({ nt: 60 }).nt, 60);
  assert.equal(normalizeTheme({ er: 0 }).er, 0);
  assert.equal(normalizeTheme({ er: "0" }).er, 1, "invalid -> skin default");
  assert.equal(BRIEF_DEFAULT, 10);
  // settings saved by 0.1.x (skin + layout) and their encoding: unchanged, nothing new is written
  const old = normalizeTheme({ sk: "neon", ly: "v" }, "fr");
  assert.equal(Buffer.from(encodeTheme(old), "base64url").toString(), '{"v":1,"sk":"neon","lg":"fr","ly":"v"}');
  // every setting away from its default still fits far below the limits (1 500 characters, event 8 KB)
  const max = normalizeTheme({ sk: "lofi", ly: "v", ac: "#010203", tx: "#040506", bg: "#070809", ba: 1, ft: "hand", sc: 199, rd: 47, sh: ["album", "time"], an: "none", tc: "slide", mq: 0, pa: "hide", pt: 599, id: "wait", al: "r", rm: 1, lg: "en", as: "square", sd: 0, nt: 59, er: 0 });
  const enc = encodeTheme(max);
  assert.ok(enc.length < MAX_ENCODED / 2, "encoded: " + enc.length);
  assert.deepEqual(decodeTheme(enc), max);
});

test("another skin keeps layout, size, content and behaviour; reset keeps the language", () => {
  const t = normalizeTheme({ sk: "studio", ly: "c", ac: "#123456", sc: 150, sh: ["art", "time"], pa: "hide", nt: 15, er: 0, lg: "en" });
  const n = withSkin(t, "lofi");
  assert.deepEqual([n.sk, n.ac, n.ly, n.sc, n.pa, n.nt, n.er, n.lg], ["lofi", SKINS.lofi.defaults.ac, "c", 150, "hide", 15, 0, "en"]);
  assert.deepEqual(n.sh, ["art", "time", "mascot"], "the skin's mascot comes with it");
  assert.deepEqual(withSkin(n, "studio").sh, ["art", "time"], "and goes away with it");
  const r = skinDefaults("neon", "en");
  assert.deepEqual({ ...r, lg: "fr" }, SKINS.neon.defaults);
  assert.equal(r.lg, "en");
  assert.equal(withSkin(t, "constructor").sk, "studio", "unknown skin: the default one");
});
