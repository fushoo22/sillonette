// Skin registry, fonts, contrast and recommended source size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeTheme, encodeTheme, FONTS, normalizeTheme, SKINS, skinInfo, sourceSize } from "../../src/shared/config.ts";
import { MIN_CONTRAST, ratio, themeContrast } from "../../src/shared/contrast.ts";

const here = dirname(fileURLToPath(import.meta.url));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("registry: six free skins, each with its stylesheet, fonts and a readable default", () => {
  assert.deepEqual(Object.keys(SKINS), ["studio", "neon", "vinyle", "retro", "arcade", "lofi"]);
  for (const s of Object.values(SKINS)) {
    assert.equal(s.tier, "free");
    assert.equal(s.defaults.sk, s.id);
    assert.ok(existsSync(join(here, "../../src/skins", s.id + ".css")), s.id + ".css");
    assert.ok(s.body in FONTS && s.defaults.ft in FONTS, s.id + " fonts");
    assert.deepEqual(normalizeTheme(s.defaults), s.defaults, s.id + " defaults are valid");
    const c = themeContrast(s.defaults);
    assert.ok(c.ok, `${s.id}: default contrast ${c.min.toFixed(2)}`);
  }
  const css = readFileSync(join(here, "../../src/overlay/overlay.css"), "utf8");
  for (const family of Object.values(FONTS)) {
    const first = family.split(",")[0].replace(/'/g, "");
    assert.ok(css.includes(`font-family: "${first}"`), "@font-face for " + first);
  }
});

test("golden rule: inherited keys and unknown ids fall back to defaults", () => {
  for (const sk of ["constructor", "__proto__", "toString", "STUDIO", 3]) assert.equal(decodeTheme(b64({ sk })).sk, "studio", String(sk));
  for (const ft of ["constructor", "hasOwnProperty", "Inter"]) assert.equal(decodeTheme(b64({ ft })).ft, "mochiy", ft);
  assert.equal(decodeTheme(b64({ sk: "neon", ac: "nope" })).ac, SKINS.neon.defaults.ac, "invalid value -> default of the chosen skin");
  assert.deepEqual(decodeTheme(b64({ sk: "lofi" })).sh, ["art", "artist", "prog", "mascot"]);
  assert.equal(decodeTheme(b64({ tc: "spin" })).tc, "auto");
});

test("every skin round-trips; the language is always written", () => {
  for (const id of Object.keys(SKINS)) {
    for (const lg of ["fr", "en"]) {
      const t = normalizeTheme({ sk: id, ly: "v", sc: 150, sh: ["art", "time"], tc: "none", lg });
      assert.deepEqual(decodeTheme(encodeTheme(t), lg === "fr" ? "en" : "fr"), t, id + " " + lg);
    }
  }
  const s = JSON.parse(Buffer.from(encodeTheme(SKINS.studio.defaults), "base64url").toString());
  assert.deepEqual(s, { v: 1, sk: "studio", lg: "fr" });
});

test("contrast and recommended source size", () => {
  assert.equal(ratio([0, 0, 0], [255, 255, 255]).toFixed(1), "21.0");
  assert.ok(!themeContrast({ tx: "#777777", bg: "#888888", ba: 100 }).ok);
  assert.ok(themeContrast({ tx: "#ffffff", bg: "#000000", ba: 100 }).ok);
  // transparent card: the scene decides, the worst case is kept
  assert.ok(!themeContrast({ tx: "#ffffff", bg: "#000000", ba: 0 }).ok);
  assert.equal(MIN_CONTRAST, 4.5);
  assert.deepEqual(sourceSize({ ly: "h", sc: 100 }), { w: 800, h: 200 });
  assert.deepEqual(sourceSize({ ly: "c", sc: 150 }), { w: 1200, h: 180 });
  assert.deepEqual(sourceSize({ ly: "v", sc: 50 }), { w: 150, h: 230 });
  assert.equal(skinInfo("constructor").id, "studio");
});
