// Texts of the popup and the options page: same keys in French and English, same placeholders, plain
// text only, every key used by the pages exists, the French written in the HTML is the dictionary's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UI, SKIN_NAMES, isUiKey, tr, statusKey } from "../../src/shared/ui-text.ts";
import { SKINS } from "../../src/shared/config.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("FR and EN: same keys, same placeholders, plain text, translated", () => {
  assert.deepEqual(Object.keys(UI.en).sort(), Object.keys(UI.fr).sort());
  let same = 0;
  for (const k of Object.keys(UI.fr)) {
    for (const l of ["fr", "en"]) {
      assert.ok(UI[l][k].trim().length > 0, `${l}.${k} empty`);
      assert.doesNotMatch(UI[l][k], /[<>]/, `${l}.${k}: plain text only`);
    }
    assert.deepEqual(vars(UI.en[k]), vars(UI.fr[k]), k + " placeholders");
    if (UI.fr[k] === UI.en[k]) same++;
  }
  assert.ok(same <= 4, "almost everything is translated (Skin, Animation, Album, Pop stay): " + same);
  for (const l of ["fr", "en"]) assert.deepEqual(Object.keys(SKIN_NAMES[l]), Object.keys(SKINS));
  assert.equal(tr("en", "sizeHint", { w: 800, h: 200 }), "Recommended size of the OBS source: 800 × 200");
  for (const st of ["off", "connecting", "ok", "open", "needpass", "auth", "unreachable", "kicked", "rpc", "noplugin", "error"]) {
    assert.ok(isUiKey(statusKey(st)), "status " + st);
  }
});

test("every key used by the popup and the options page exists, French HTML = dictionary", () => {
  for (const page of ["src/popup/popup.html", "src/options/options.html"]) {
    const html = readFileSync(join(root, page), "utf8");
    const used = [...html.matchAll(/data-i18n(?:-label|-title)?="(\w+)"/g)].map((m) => m[1]);
    assert.ok(used.length > 10, page);
    for (const k of used) assert.ok(isUiKey(k), `${page}: unknown key ${k}`);
    // text written in the HTML (shown before the script runs) is the French dictionary text
    for (const m of html.matchAll(/data-i18n="(\w+)"[^>]*>([^<]*)</g)) {
      const text = m[2].replace(/&amp;/g, "&").trim();
      if (text) assert.equal(text, UI.fr[m[1]], `${page}: ${m[1]}`);
    }
  }
});
