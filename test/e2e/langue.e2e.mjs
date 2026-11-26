// Interface language, end to end in headless Chromium with an ENGLISH browser (locale fixed here, as
// the GitHub runners are in English anyway): popup and options page in English by default, every
// popup state in English, FR/EN buttons remembered and shared by both pages, the overlay's own
// language never changed by them, description from _locales, axe-core on the English page.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildForTests, freePort, isolate, CHROMIUM, ROOT, OUT } from "./lib.mjs";
import { startFakeObs } from "./fake-obs.mjs";
import { UI } from "../../src/shared/ui-text.ts";

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PASSWORD = "mdp-essai-" + Math.random().toString(36).slice(2); // test-only password
let ctx, profile, extId, sw, obs, obsPort, dist;
const errors = [];

before(async () => {
  dist = buildForTests(join(ROOT, "dist/e2e-langue"));
  obsPort = await freePort();
  obs = await startFakeObs({ port: obsPort, password: PASSWORD, onEmit: () => undefined });
  profile = mkdtempSync(join(tmpdir(), "sillonette-e2e-langue-"));
  const dir = join(dist, "chrome");
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM, headless: true, viewport: { width: 1280, height: 900 }, locale: "en-US",
    env: { ...process.env, LANG: "en_US.UTF-8", LANGUAGE: "en_US", LC_ALL: "en_US.UTF-8" },
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--mute-audio", "--lang=en-US"],
  });
  await isolate(ctx);
  ctx.on("page", (p) => p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }));
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
});
after(async () => {
  await ctx?.close();
  await obs?.stop();
  if (profile) rmSync(profile, { recursive: true, force: true });
});

const status = (p) => p.textContent("#status");

test("English browser: popup in English, every state and error message too", async () => {
  assert.equal(await sw.evaluate(() => chrome.i18n.getUILanguage()), "en-US");
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForFunction(() => document.documentElement.lang === "en");
  assert.equal(await popup.textContent('label[for="port"]'), UI.en.port);
  assert.equal(await popup.textContent("#save"), "Save and connect");
  assert.equal(await popup.textContent("#customize"), "Customize…");
  assert.match(await popup.textContent(".warn-box"), /^This password opens all of OBS, stream key included\./);
  assert.match(await popup.textContent("#size"), /^Recommended size of the OBS source: 800 × 200$/);
  assert.equal(await popup.getAttribute(".ui-lang", "aria-label"), "Interface language");
  assert.equal(await popup.getAttribute('button[data-ui-lang="en"]', "aria-pressed"), "true");
  assert.ok((await popup.$$eval("#skin option", (o) => o.map((x) => x.textContent))).includes("Vinyl"));
  await popup.fill("#port", String(obsPort));
  await popup.fill("#password", "faux");
  await popup.click("#save");
  await popup.waitForFunction((t) => document.getElementById("status").textContent === t, UI.en.st_auth, { timeout: 8000 });
  assert.equal(await popup.getAttribute("#dot", "aria-label"), UI.en.st_auth, "accessible state in English");
  await popup.fill("#password", "••••••••");
  await popup.click("#save");
  await popup.waitForFunction((t) => document.getElementById("pwError").textContent === t, UI.en.pwMasked, { timeout: 3000 });
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction((t) => document.getElementById("status").textContent === t, UI.en.st_ok, { timeout: 8000 });
  assert.equal(await popup.textContent("#pwHint"), UI.en.pwSaved);
  await popup.screenshot({ path: join(OUT, "popup-en.png"), fullPage: true });
  await obs.stop();
  await popup.waitForFunction((t) => document.getElementById("status").textContent === t, UI.en.st_unreachable, { timeout: 8000 });
  await popup.close();
});

test("FR/EN buttons: remembered, shared by popup and options page, overlay language untouched", async () => {
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "studio", lg: "en", ac: "#123456" } }));
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForFunction(() => document.documentElement.lang === "en" && document.title === "Sillonette · customize the overlay");
  assert.equal(await opt.textContent("h1"), "Customize the overlay");
  assert.equal(await opt.textContent('label[for="pa"]'), "When paused");
  assert.equal(await opt.textContent("#reset"), "Reset the skin's settings");
  assert.match(await opt.textContent("#contrast"), /^Text contrast: \d+(\.\d)?:1/);
  assert.equal(await opt.getAttribute("#frame", "title"), UI.en.frameTitle);
  assert.equal(await opt.textContent("details summary"), UI.en.cssSummary);
  await opt.screenshot({ path: join(OUT, "options-en.png"), fullPage: true });
  // axe-core on the English page
  await opt.evaluate(AXE);
  const res = await opt.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  assert.deepEqual(res.violations.map((v) => v.id), [], "axe (EN)");

  // French chosen on the options page: kept, the popup follows, the overlay language stays "en"
  await opt.click('button[data-ui-lang="fr"]');
  await opt.waitForFunction(() => document.documentElement.lang === "fr" && document.querySelector("h1").textContent === "Personnaliser l'overlay");
  assert.match(await opt.textContent("#contrast"), /^Contraste du texte : \d+(,\d)?:1/);
  assert.equal(await sw.evaluate(async () => (await chrome.storage.local.get("uiLang")).uiLang), "fr");
  const th = await sw.evaluate(async () => (await chrome.storage.local.get("theme")).theme);
  assert.deepEqual([th.lg, th.ac], ["en", "#123456"], "overlay language and settings untouched");
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForFunction(() => document.documentElement.lang === "fr");
  assert.equal(await popup.textContent("#save"), "Enregistrer et connecter");
  assert.equal(await popup.textContent("#status"), UI.fr.st_unreachable);
  // back to English from the popup: the open options page follows at once
  await popup.click('button[data-ui-lang="en"]');
  await popup.waitForFunction(() => document.querySelector("#save").textContent === "Save and connect");
  await opt.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 3000 });
  await opt.reload();
  await opt.waitForFunction(() => document.documentElement.lang === "en");
  assert.equal(await opt.inputValue("#lg"), "en");
  assert.equal(await sw.evaluate(async () => (await chrome.storage.local.get("theme")).theme.lg), "en");
  await popup.close();
  await opt.close();
  assert.deepEqual(errors.filter((e) => /Content Security Policy|Refused/.test(e)), [], "no CSP error");
});

test("extensions page: name and description from _locales", async () => {
  const m = await sw.evaluate(() => [chrome.runtime.getManifest().name, chrome.i18n.getMessage("extDescription")]);
  assert.deepEqual(m, ["Sillonette", "Shows the YouTube Music track in OBS, without any server (OBS WebSocket on this PC). Beta version."]);
});
