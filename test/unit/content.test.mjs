// Content script (YouTube Music connector, change detection, ads) and the track event built from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ytmusic, bestArtwork, normalizeArt, timing, SELECTORS } from "../../src/content/ytmusic.ts";
import { shouldSend, maskAd, HEARTBEAT_MS, Settler, AdMemory, Tracker, SETTLE_MS } from "../../src/content/change.ts";
import { trackEvent } from "../../src/background/track.ts";
import { cleanNp } from "../../src/shared/event.ts";
// ---------- connector ----------
function page({ meta = null, media = null, dom = {}, ad = false } = {}) {
  return {
    metadata: () => meta,
    media: () => media,
    text: (sel) => dom[sel] ?? "",
    attr: (sel, name) => dom[sel + "@" + name] ?? "",
    exists: () => ad,
  };
}
const media = (o = {}) => ({ currentTime: 63.25, duration: 214, paused: false, ended: false, playbackRate: 1, ...o });
const meta = {
  title: "Titre", artist: "Artiste", album: "Album",
  artwork: [
    { src: "https://lh3.googleusercontent.com/a=w60-h60-l90-rj", sizes: "60x60" },
    { src: "https://lh3.googleusercontent.com/a=w544-h544-l90-rj", sizes: "544x544" },
    { src: "https://lh3.googleusercontent.com/a=w226-h226-l90-rj", sizes: "226x226" },
  ],
};

test("connector: mediaSession + media element", () => {
  const t = ytmusic.read(page({ meta, media: media() }));
  assert.deepEqual(t, { state: "playing", title: "Titre", artist: "Artiste", album: "Album", art: "https://lh3.googleusercontent.com/a=w544-h544-l90-rj", dur: 214000, pos: 63250, rate: 1, ad: false, ready: true });
  assert.equal(ytmusic.read(page({ meta, media: media({ readyState: 0, duration: NaN }) })).ready, false, "emptied element");
  assert.equal(ytmusic.read(page({ meta, media: media({ seeking: true }) })).ready, false, "seek in progress");
  assert.equal(ytmusic.read(page({ meta, media: media({ paused: true }) })).state, "paused");
  assert.equal(ytmusic.read(page({ meta, media: media({ ended: true }) })).state, "paused");
  const live = ytmusic.read(page({ meta, media: media({ duration: Infinity, currentTime: 12 }) }));
  assert.equal(live.dur, 0);
  assert.equal(live.pos, 12000);
  assert.equal(ytmusic.read(page({ meta, media: media({ duration: NaN }) })).dur, 0);
  assert.equal(ytmusic.read(page({ meta, media: media({ playbackRate: 16 }) })).rate, 1);
  assert.equal(ytmusic.read(page({ meta, media: media(), ad: true })).ad, true);
});

test("connector: DOM fallback and nothing playing", () => {
  const dom = { "ytmusic-player-bar .title": "Titre DOM", "ytmusic-player-bar .byline": "Artiste DOM • Album DOM • 2024",
    "ytmusic-player-bar img.image, ytmusic-player-bar .thumbnail img@src": "https://lh3.googleusercontent.com/b=w60-h60-l90-rj" };
  const t = ytmusic.read(page({ media: media(), dom }));
  assert.equal(t.title, "Titre DOM");
  assert.equal(t.artist, "Artiste DOM");
  assert.equal(t.album, "Album DOM");
  assert.equal(t.art, "https://lh3.googleusercontent.com/b=w544-h544-l90-rj");
  assert.equal(ytmusic.read(page({ media: media(), dom: { "ytmusic-player-bar .title": "T", "ytmusic-player-bar .byline": "Artiste • 12 M vues" } })).album, "");
  assert.equal(ytmusic.read(page({ meta, media: null })), null);
  assert.equal(ytmusic.read(page({ media: media() })), null);
});

test("artwork helpers", () => {
  assert.equal(bestArtwork([]), "");
  assert.equal(normalizeArt("https://yt3.ggpht.com/x=s88-c-k"), "https://yt3.ggpht.com/x=s544-c-k");
  assert.equal(normalizeArt("https://i.ytimg.com/vi/a/hq.jpg"), "https://i.ytimg.com/vi/a/hq.jpg");
  assert.equal(normalizeArt("data:image/png;base64,xx"), "");
  assert.equal(normalizeArt("http://lh3.googleusercontent.com/a"), "");
  // Real YouTube Music (25/11/2026): a single 16:9 video thumbnail on yt3.googleusercontent.com.
  const yt3 = "https://yt3.googleusercontent.com/" + "Ab1_cD2-eF3g".repeat(6) + "hI4j";
  assert.equal(normalizeArt(yt3), yt3);
  assert.equal(normalizeArt(yt3 + "=w320-h180-l90-rj"), yt3 + "=w320-h180-l90-rj", "non-square sizes are kept");
  assert.equal(normalizeArt(yt3 + "=w120-h120-l90-rj"), yt3 + "=w544-h544-l90-rj");
});

test("video thumbnail on yt3.googleusercontent.com is kept; look-alike hosts are dropped", () => {
  const yt3 = "https://yt3.googleusercontent.com/" + "Ab1_cD2-eF3g".repeat(6) + "hI4j";
  const t = ytmusic.read(page({ meta: { title: "T", artist: "A", album: "", artwork: [{ src: yt3, sizes: "320x180" }] }, media: media() }));
  assert.equal(t.art, yt3);
  const ev = trackEvent(t, 1, 2);
  assert.equal(ev.art, yt3);
  assert.equal(cleanNp(ev).art, yt3, "the overlay accepts it too");
  for (const bad of ["https://googleusercontent.com/a", "https://evilgoogleusercontent.com/a", "https://yt3.googleusercontent.com.evil.example/a", "https://yt3.googleusercontent.com:444/a", "http://yt3.googleusercontent.com/a"])
    assert.equal(trackEvent({ ...t, art: bad }, 1, 2).art, "", bad);
});

test("timing: the player bar is the per-track truth when the media clock spans several tracks", () => {
  const P = SELECTORS.progress;
  const at = (value, max, m) => timing(page({ dom: { [P + "@value"]: value, [P + "@aria-valuemax"]: max } }), media(m));
  // own clock (bar within 1.5 s): precise media position, bar duration
  assert.deepEqual(at("63", "214", { currentTime: 63.25, duration: 214.06 }), { dur: 214000, pos: 63250 });
  // gapless (field data): media 604 s / 632 s, bar 1:49 / 2:02
  assert.deepEqual(at("109", "122", { currentTime: 604.07, duration: 632.317 }), { dur: 122000, pos: 109000 });
  // no player bar (or not numeric): media element alone
  assert.deepEqual(at("", "", { currentTime: 12.5, duration: 100 }), { dur: 100000, pos: 12500 });
  assert.deepEqual(at("x", "0", { currentTime: 12.5, duration: 100 }), { dur: 100000, pos: 12500 });
  // inconsistent clock and no bar: no duration rather than a full, stuck bar
  assert.deepEqual(at("", "", { currentTime: 604, duration: 109.053 }), { dur: 0, pos: 604000 });
});

// ---------- change detection ----------
const tr = (o = {}) => ({ state: "playing", title: "A", artist: "B", album: "", art: "", dur: 200000, pos: 10000, rate: 1, ad: false, ready: true, ...o });

test("change detection: only meaningful changes + 20 s heartbeat", () => {
  assert.equal(shouldSend(null, null, 0), false);
  assert.equal(shouldSend(null, tr(), 0), true);
  const prev = { track: tr(), at: 0 };
  assert.equal(shouldSend(prev, tr({ pos: 11000 }), 1000), false, "normal progress");
  assert.equal(shouldSend(prev, tr({ pos: 14000 }), 1000), true, "jump > 2 s");
  assert.equal(shouldSend(prev, tr({ title: "Z", pos: 11000 }), 1000), true, "new track");
  assert.equal(shouldSend(prev, tr({ state: "paused" }), 1000), true, "pause");
  assert.equal(shouldSend(prev, tr({ rate: 1.5, pos: 11000 }), 1000), true, "rate");
  assert.equal(shouldSend(prev, tr({ pos: 10000 + HEARTBEAT_MS }), HEARTBEAT_MS), true, "heartbeat");
  const paused = { track: tr({ state: "paused" }), at: 0 };
  assert.equal(shouldSend(paused, tr({ state: "paused" }), 60_000), false, "a paused tab goes quiet");
  assert.equal(shouldSend(prev, null, 1000), true, "music gone");
  assert.equal(shouldSend({ track: null, at: 0 }, null, 99_000), false);
  // 1 Hz polling for 10 minutes of steady playback: ~ 3 sends/min
  let last = { track: tr({ pos: 0 }), at: 0 }, sends = 0;
  for (let s = 1; s <= 600; s++) {
    const cur = tr({ pos: s * 1000 });
    if (shouldSend(last, cur, s * 1000)) { sends++; last = { track: cur, at: s * 1000 }; }
  }
  assert.equal(sends, 30);
});

test("settling: a new track is sent once stable for SETTLE_MS", () => {
  const st = new Settler();
  assert.equal(st.wait(null, tr(), 1000), SETTLE_MS);
  assert.equal(st.wait(null, tr(), 1300), SETTLE_MS - 300);
  assert.equal(st.wait(null, tr({ album: "Album" }), 1350), SETTLE_MS, "album arrived later: wait again");
  assert.equal(st.wait(null, tr({ album: "Album" }), 1750), 0);
  assert.equal(st.wait(tr(), tr({ pos: 50000, state: "paused" }), 9000), 0, "same track: never delayed");
});

test("ad memory: an ad stays an ad once the ad class is gone", () => {
  const m = new AdMemory();
  assert.equal(m.classify(tr({ title: "Pub", ad: true })).ad, true);
  assert.equal(m.classify(tr({ title: "Pub", ad: false })).ad, true);
  assert.equal(m.classify(tr({ title: "Vrai" })).ad, false);
});

test("ads are never shown as a track", () => {
  const real = tr({ title: "Vrai titre" });
  assert.deepEqual(maskAd(tr({ title: "Publicité", ad: true }), real), { ...real, state: "paused" });
  assert.equal(maskAd(tr({ ad: true }), null), null);
  assert.equal(maskAd(real, null), real);
});

// ---------- replay of sequences recorded on the real YouTube Music (anonymised fixtures) ----------
const fx = (name) => JSON.parse(readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8"));
function fxPage(s) {
  const m = s.media && { ...s.media, duration: s.media.duration ?? NaN };
  return {
    metadata: () => s.meta,
    media: () => m,
    text: (sel) => (sel === SELECTORS.barTitle ? s.barTitle ?? "" : ""),
    attr: (sel, name) => (sel === SELECTORS.progress && s.bar ? (name === "value" ? s.bar.value : name === "aria-valuemax" ? s.bar.max : "") ?? "" : ""),
    exists: () => !!s.ad,
  };
}
/** Feeds every snapshot to the real connector + Tracker, honouring the re-checks it asks for. */
function replay(snaps) {
  const tracker = new Tracker();
  const sends = [];
  const list = snaps.filter((s) => !s.action);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const next = list[i + 1]?.t ?? Infinity;
    for (let t = s.t, k = 0; k < 20 && t < next; k++) {
      const st = tracker.step(ytmusic.read(fxPage(s)), t);
      if (st.send) { sends.push({ t, track: st.track, snap: s }); break; }
      if (st.recheckIn === undefined) break;
      t += st.recheckIn;
    }
  }
  return sends;
}
function checkConsistent(sends) {
  for (const { track, snap } of sends) {
    if (!track) continue;
    assert.ok(snap.media.readyState >= 1 && !snap.media.seeking, "never sent between two items");
    assert.ok(track.dur === 0 || track.pos <= track.dur, `pos ${track.pos} <= dur ${track.dur}`);
    const body = trackEvent(track, 0, 0);
    assert.deepEqual(cleanNp(body), body);
    if (snap.bar && Number(snap.bar.max) > 0) {
      assert.equal(track.dur, Number(snap.bar.max) * 1000, "duration = YouTube Music's own bar");
      assert.ok(Math.abs(track.pos - Number(snap.bar.value) * 1000) <= 1500, `pos ${track.pos} vs bar ${snap.bar.value}`);
    }
    if (track.art) assert.equal(body.art, track.art, "artwork kept");
  }
}

test("real sequence (Premium, gapless): the media clock spans several tracks, the bar does not", () => {
  const f = fx("ytmusic-premium-gapless.json");
  const first = f.snapshots.find((s) => s.meta);
  // what 0.1.0 sent: the media element's cumulative clock (the reported bug)
  assert.ok(first.media.duration > 600 && first.media.currentTime > 600 && Number(first.bar.max) === 122);
  const sends = replay(f.snapshots);
  checkConsistent(sends);
  assert.equal(sends[0].track.dur, 122000);
  assert.ok(Math.abs(sends[0].track.pos - 109000) <= 1500);
  // gapless change (no "emptied"): the next track starts at ~0 although currentTime is ~100 s
  const gap = sends.find((x) => x.track && x.snap.media.currentTime > 99 && x.track.pos < 2000);
  assert.ok(gap, "gapless track change sent with its own position");
  assert.equal(gap.track.dur, 155000);
  // every track of the recording reached the overlay, with its album and artwork
  const titles = [...new Set(sends.map((x) => x.track?.title))];
  assert.equal(titles.length, 5, titles.join(", "));
  for (const t of titles) {
    const lastOf = sends.filter((x) => x.track?.title === t).at(-1).track;
    assert.match(lastOf.art, /^https:\/\/yt3\.googleusercontent\.com\//);
    assert.notEqual(lastOf.album, "", "album arrives after the title: re-sent once stable");
  }
});

test("real sequence (Premium, next + natural end with emptied): stale bar or title never sent", () => {
  const sends = replay(fx("ytmusic-premium-firefox.json").snapshots);
  checkConsistent(sends);
  assert.ok(sends.length >= 5 && sends.length <= 14, "sends: " + sends.length);
  const titles = [...new Set(sends.map((x) => x.track?.title))];
  assert.deepEqual(titles, ["Titre 1", "Titre 4", "Titre 6", "Titre 9", "Titre 12"]);
});

test("real sequence (free account, ads): no ad title ever leaves the page", () => {
  const sends = replay(fx("ytmusic-free-ads-chromium.json").snapshots);
  for (const { track } of sends) assert.ok(!track || !/Publicite/.test(track.title), "ad leaked: " + track?.title);
  checkConsistent(sends);
  assert.deepEqual(sends.map((x) => x.track && [x.track.title, x.track.state]), [["Titre 1", "playing"], ["Titre 1", "paused"], ["Titre 2", "playing"]]);
});


// ---------- track event ----------
test("track event: always valid for the overlay, cleaned and bounded", () => {
  const cases = [
    tr(), tr({ title: "x".repeat(500), artist: "🎵".repeat(300) }), tr({ pos: 999999999 }), tr({ dur: 0, pos: 5e6 }),
    tr({ art: "https://evil.example/a.png" }), tr({ art: "https://lh3.googleusercontent.com/a=w544-h544" }),
    tr({ rate: NaN }), tr({ rate: 9 }), tr({ title: "  a\n\tb  " + String.fromCodePoint(0x202e) }), tr({ dur: -5 }), tr({ state: "paused" }),
  ];
  for (const c of cases) {
    const ev = trackEvent(c, 1000, 2000);
    assert.notEqual(ev.state, "idle", JSON.stringify(c).slice(0, 60));
    assert.deepEqual(cleanNp(ev), ev, JSON.stringify(ev).slice(0, 80));
  }
  assert.equal(trackEvent(tr({ art: "https://evil.example/a.png" }), 1, 2).art, "");
  assert.equal(trackEvent(tr({ title: "  a\n\tb  " + String.fromCodePoint(0x202e) }), 1, 2).title, "a b");
  assert.deepEqual(trackEvent(tr({ title: "   " }), 1, 2), { v: 1, state: "idle", now: 2 });
  assert.deepEqual(trackEvent(null, 1, 2), { v: 1, state: "idle", now: 2 });
  assert.equal([...trackEvent(tr({ title: "é".repeat(300) }), 1, 2).title].length, 200);
  assert.equal(trackEvent(tr({ rate: 9 }), 1, 2).rate, 4);
  assert.equal(trackEvent(tr({ pos: 999999999 }), 1, 2).pos, 200000);
});
