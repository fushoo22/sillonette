// Overlay: settings decoder, preview fragment, helpers, error badge, text cleaning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeTheme, encodeTheme, normalizeTheme, parseFragment, rgba, SKINS, MAX_ENCODED, langFromNavigator } from "../../src/shared/config.ts";
import { cleanText, codePoints, truncate } from "../../src/shared/clean.ts";
import { formatTime } from "../../src/overlay/render.ts";
import { demoEvent } from "../../src/overlay/demo.ts";
import { ErrorBadge } from "../../src/overlay/badge.ts";
import { errorMessage } from "../../src/overlay/i18n.ts";

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

test("theme: defaults, round trip, golden rule", () => {
  const d = decodeTheme(null);
  assert.deepEqual(d, SKINS.studio.defaults);
  const t = normalizeTheme({ ly: "v", ac: "#FFF", sh: ["time", "art", "nope"], sc: 150, lg: "en" });
  assert.equal(t.ac, "#ffffff");
  assert.deepEqual(t.sh, ["art", "time"]);
  assert.deepEqual(decodeTheme(encodeTheme(t)), t);
  // invalid values -> skin default, unknown keys ignored, no exception
  const bad = decodeTheme(b64({ v: 9, sk: "nope", ly: "x", ac: "red", ba: 101, sc: 10, rd: 1.5, pa: 3, zz: { a: 1 } }));
  assert.equal(bad.sk, "studio");
  for (const k of ["ly", "ac", "ba", "sc", "rd", "pa"]) assert.equal(bad[k], d[k], k);
  for (const s of ["!!!", b64("not json"), b64("[1,2]"), b64("null"), "A".repeat(MAX_ENCODED + 1), "%%", b64(Buffer.from([0xff, 0xfe]).toString("latin1"))]) {
    assert.deepEqual(decodeTheme(s), d, s.slice(0, 20));
  }
  assert.ok(encodeTheme(d).length < 50, "defaults encode to a short string");
});

test("preview fragment: demo, settings, error codes", () => {
  const f = parseFragment("#s=" + b64({ ly: "c" }) + "&demo=1");
  assert.equal(f.demo, true);
  assert.equal(f.theme.ly, "c");
  assert.equal(parseFragment("").demo, false);
  assert.equal(parseFragment("#demo=1", "en").theme.lg, "en");
  assert.equal(langFromNavigator({ language: "fr-CA" }), "fr");
  assert.equal(langFromNavigator({ language: "de" }), "en");
  assert.equal(parseFragment("#demo=1").er, true);
  assert.equal(parseFragment("#demo=1&er=0").er, false);
  assert.equal(parseFragment("#demo=1&er=zz").er, true, "invalid -> default (on)");
  assert.equal(parseFragment("#demo=1&err=E10").err, "E10");
  assert.equal(parseFragment("#demo=1&err=E99").err, null);
  assert.equal(parseFragment("#demo=1&err=<b>x</b>").err, null);
  assert.equal(parseFragment("#err=E10").err, null, "err is a demo-only option");
});

test("helpers", () => {
  assert.equal(rgba("#203856", 90), "rgba(32, 56, 86, 0.9)");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(63_250), "1:03");
  assert.equal(formatTime(3_725_000), "1:02:05");
  assert.equal(formatTime(-5), "0:00");
  const ev = demoEvent(0, 1000);
  assert.equal(ev.state, "playing");
  assert.match(ev.art, /^demo\/art-\d\.svg$/, "demo artworks are local files");
});

test("cleanText and truncate", () => {
  assert.equal(cleanText("  a\u0000b‮ c  d  "), "ab c d");
  assert.equal(cleanText("é"), "é", "NFC");
  assert.equal(truncate("abc", 3), "abc");
  assert.equal(truncate("abcd", 3), "ab…");
  assert.equal(codePoints(truncate("😀".repeat(10), 5)), 5, "never splits a surrogate pair");
});

function fakeEl() {
  // Only textContent/hidden/dataset exist: anything else (innerHTML…) would be an error.
  return Object.seal({ textContent: "", hidden: true, dataset: {} });
}
const badgeEls = () => ({ root: fakeEl(), code: fakeEl(), msg: fakeEl() });

test("badge: shows the code and message as text, disappears when the error ends", () => {
  const els = badgeEls();
  const b = new ErrorBadge(els, "fr", true);
  assert.equal(els.root.hidden, true);
  b.set("E10");
  assert.equal(els.root.hidden, false);
  assert.equal(els.code.textContent, "E10");
  assert.equal(els.msg.textContent, errorMessage("fr", "E10"));
  assert.equal(els.root.dataset.code, "E10");
  b.set("");
  assert.equal(els.root.hidden, true);
  assert.equal(els.code.textContent, "");
  const en = badgeEls();
  new ErrorBadge(en, "en", true).set("E10");
  assert.equal(en.msg.textContent, "Several tabs: another YouTube Music tab is already playing");
  for (const lg of ["fr", "en"]) assert.ok(errorMessage(lg, "E10").length > 5);
});

test("badge: er=0 never shows anything", () => {
  const els = badgeEls();
  const b = new ErrorBadge(els, "fr", false);
  b.set("E10");
  b.setFixed("E10");
  assert.equal(els.root.hidden, true);
  assert.equal(b.code, "");
});
