// Options page end to end (headless, muted Chromium, real extension): live preview made by the real
// overlay in demo mode, strict CSP, settings saved in storage.local and carried to OBS inside the
// existing "theme" field, "a few seconds at each new track", popup button and skin change, reset,
// invalid or old saved settings, keyboard only, and an axe-core WCAG 2.1 AA audit.
import { test, before, after } from "node:test";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { buildForTests, freePort, isolate, CHROMIUM, ROOT, OUT, sleep, FRENCH_ENV } from "./lib.mjs";
import { startFakeObs } from "./fake-obs.mjs";
import { decodeTheme } from "../../src/shared/config.ts";

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PASSWORD = "mdp-essai-" + Math.random().toString(36).slice(2); // test-only password
let ctx, profile, extId, sw, obs, dist, site;
const emitted = [];
const overlays = new Set();
const consoleErrors = [];

before(async () => {
  dist = buildForTests(join(ROOT, "dist/e2e-options"));
  const obsPort = await freePort();
  obs = await startFakeObs({
    port: obsPort, password: PASSWORD,
    onEmit: (name, json) => {
      emitted.push(JSON.parse(json));
      for (const p of overlays) p.evaluate(([n, j]) => window.dispatchEvent(new CustomEvent(n, { detail: JSON.parse(j) })), [name, json]).catch(() => undefined);
    },
  });
  const html = readFileSync(join(ROOT, "test/e2e/fake-ytmusic.html"));
  site = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  profile = mkdtempSync(join(tmpdir(), "sillonette-e2e-options-"));
  const dir = join(dist, "chrome");
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM, headless: true, viewport: { width: 1280, height: 900 }, locale: "fr-FR", env: FRENCH_ENV,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  await isolate(ctx);
  await ctx.route((u) => u.protocol === "file:", (route) => route.continue());
  ctx.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  ctx.on("page", (p) => p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); }));
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await sw.evaluate(([port, pw]) => chrome.storage.local.set({ obsPort: port, obsPassword: pw }), [obsPort, PASSWORD]);
});

after(async () => {
  await ctx?.close();
  await obs?.stop();
  site?.close();
  if (profile) rmSync(profile, { recursive: true, force: true });
});

const optionsUrl = () => `chrome-extension://${extId}/options.html`;
const stored = () => sw.evaluate(async () => (await chrome.storage.local.get("theme")).theme);
const frameOf = (page) => page.frame({ url: /apercu\.html/ });
async function openOptions() {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(optionsUrl());
  await page.waitForFunction(() => document.getElementById("frame").getAttribute("src") !== null);
  await page.waitForFunction(() => {
    const d = document.getElementById("frame").contentDocument;
    const c = d?.querySelector(".sillonette");
    return c && c.dataset.state === "playing" && c.classList.contains("is-visible");
  }, null, { timeout: 8000 });
  return page;
}
async function lastTheme(pred, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ev = emitted.at(-1);
    if (ev) {
      const t = decodeTheme(ev.theme);
      if (pred(t)) return t;
    }
    await sleep(100);
  }
  throw new Error("no event with the expected theme; last: " + JSON.stringify(emitted.at(-1)?.theme && decodeTheme(emitted.at(-1).theme)));
}

test("options: live preview by the real overlay, saved at once, sent to OBS in the same field", async () => {
  const page = await openOptions();
  const fr = frameOf(page);
  assert.ok(fr, "preview frame");
  // the form shows the saved settings from the start (nothing saved yet: the Studio skin's)
  assert.deepEqual(await page.evaluate(() => [document.getElementById("sk").value, document.getElementById("ac").value, ...[...document.querySelectorAll('input[name="sh"]:checked')].map((b) => b.value)]), ["studio", "#a3216b", "art", "artist", "prog"]);
  const fonts = await fr.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family); });
  assert.ok(fonts.includes("Mochiy Pop One"), "preview fonts load from the extension: " + fonts);
  assert.match(await fr.textContent(".title > span"), /Nuage pêche|Ciel de beurre|Framboise/, "fictitious demo tracks");
  assert.equal(await fr.evaluate(() => document.querySelector(".art img").getAttribute("src")), "demo/art-1.svg", "local demo artwork");
  await page.screenshot({ path: join(OUT, "options.png"), fullPage: true });

  // colour: preview follows without reloading, storage and OBS follow
  const marker = await fr.evaluate(() => (window.__keep = Math.random()));
  await page.fill("#ac", "#12ab34");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("frame").contentDocument.documentElement).getPropertyValue("--o-accent").trim() === "#12ab34", null, { timeout: 3000 });
  assert.equal(await frameOf(page).evaluate(() => window.__keep), marker, "preview updated live, not reloaded");
  await page.waitForFunction(async () => (await chrome.storage.local.get("theme")).theme?.ac === "#12ab34", null, { timeout: 3000 });
  await lastTheme((t) => t.ac === "#12ab34");

  // several settings at once, then the event: still one emit_event, still the "theme" string field
  await page.selectOption("#sk", "neon");
  await page.waitForFunction(() => document.getElementById("ac").value === "#ff4fd8", null, { timeout: 3000 }); // another skin brings its colours
  await page.check('input[name="ly"][value="v"]');
  await page.fill("#sc", "150");
  await page.selectOption("#ft", "hand");
  await page.uncheck('input[name="sh"][value="art"]');
  await page.check('input[name="sh"][value="time"]');
  await page.selectOption("#an", "pop");
  await page.selectOption("#tc", "fade");
  await page.check("#rm");
  await page.selectOption("#as", "round");
  await page.selectOption("#sd", "0");
  await page.fill("#rd", "40");
  await page.uncheck("#mq");
  await page.selectOption("#pa", "hide");
  await page.fill("#pt", "30");
  await page.selectOption("#id", "wait");
  await page.check('input[name="al"][value="r"]');
  await page.selectOption("#lg", "en");
  await page.uncheck("#er");
  const t = await lastTheme((x) => x.sk === "neon" && x.lg === "en" && x.er === 0 && x.ly === "v");
  assert.deepEqual(
    { sc: t.sc, ft: t.ft, sh: t.sh, an: t.an, tc: t.tc, rm: t.rm, as: t.as, sd: t.sd, rd: t.rd, mq: t.mq, pa: t.pa, pt: t.pt, id: t.id, al: t.al },
    { sc: 150, ft: "hand", sh: ["artist", "prog", "time"], an: "pop", tc: "fade", rm: 1, as: "round", sd: 0, rd: 40, mq: 0, pa: "hide", pt: 30, id: "wait", al: "r" },
  );
  const ev = emitted.at(-1);
  assert.deepEqual(Object.keys(ev).sort(), ["err", "np", "theme", "v"], "nothing new in the event");
  assert.equal(typeof ev.theme, "string");
  for (const r of obs.log.requests) assert.equal(r.requestData.requestType, "emit_event", "only emit_event");
  const p = frameOf(page);
  await p.waitForFunction(() => {
    const c = document.querySelector(".sillonette");
    return c.dataset.skin === "neon" && c.dataset.layout === "v" && c.dataset.align === "r" && document.documentElement.lang === "en";
  }, null, { timeout: 4000 });
  assert.equal(await page.textContent("#size"), "450 × 690 px", "recommended size follows layout and scale");
  await page.screenshot({ path: join(OUT, "options-neon-v.png"), fullPage: true });

  // reset: the skin's own settings (language kept)
  await page.click("#reset");
  await page.waitForFunction(async () => {
    const th = (await chrome.storage.local.get("theme")).theme;
    return th?.sk === "neon" && th.ly === "h" && th.sc === 100 && th.er === 1 && th.lg === "en" && th.ac === "#ff4fd8";
  }, null, { timeout: 3000 });
  assert.match(await page.textContent("#saved"), /rétablis/);
  await page.close();
});

test("options: \"a few seconds at each new track\" in the preview and in a file:// overlay", async () => {
  const page = await openOptions();
  await page.check('input[name="vis"][value="brief"]');
  assert.equal(await page.inputValue("#nt"), "10", "10 s by default");
  assert.equal((await stored()).nt, 10);
  await page.fill("#nt", "3");
  await page.locator("#nt").blur();
  await page.waitForFunction(async () => (await chrome.storage.local.get("theme")).theme?.nt === 3, null, { timeout: 3000 });
  // out of range: brought back into 3-60, the mode stays on
  await page.fill("#nt", "500");
  await page.locator("#nt").blur();
  await page.waitForFunction(() => document.getElementById("nt").value === "60", null, { timeout: 3000 });
  await page.fill("#nt", "3");
  await page.locator("#nt").blur();
  // the preview's card goes away after 3 s (state unchanged), comes back with the next demo track
  const fr = frameOf(page);
  await fr.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("is-visible"), null, { timeout: 6000 });
  assert.equal(await fr.evaluate(() => document.querySelector(".sillonette").dataset.state), "playing");
  await fr.waitForFunction(() => document.querySelector(".sillonette").classList.contains("is-visible"), null, { timeout: 10000 });

  // the OBS overlay (file://) gets it with the events: a real track from the content side is not
  // needed, the background sends "idle" + theme; here we drive the overlay with the extension's events
  const ov = await ctx.newPage();
  await ov.setViewportSize({ width: 800, height: 200 });
  await ov.goto(pathToFileURL(join(dist, "overlay/sillonette-overlay.html")).href); // driven by hand below
  const base = emitted.at(-1);
  assert.equal(decodeTheme(base.theme).nt, 3);
  const send = (np, err = "") => ov.evaluate(([d]) => window.dispatchEvent(new CustomEvent("sillonette", { detail: d })), [{ ...base, np, err }]);
  const np = (title, state = "playing") => ({ v: 1, state, title, artist: "A", album: "", art: "", dur: 200000, pos: 1000, rate: 1, at: Date.now(), now: Date.now() });
  await send(np("Un"));
  await ov.waitForFunction(() => document.querySelector(".sillonette").classList.contains("is-visible"));
  await sleep(1500);
  await send(np("Un")); // the 5 s resend does not extend the window
  await ov.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("is-visible"), null, { timeout: 3000 });
  await send(np("Un", "paused"));
  await send(np("Un"));
  await sleep(300);
  assert.equal(await ov.evaluate(() => document.querySelector(".sillonette").classList.contains("is-visible")), false, "no comeback on resume");
  await send(np("Un"), "E10");
  assert.equal(await ov.evaluate(() => document.querySelector(".sillonette-err").hidden), false, "E10 badge visible while the card is hidden");
  await send(np("Deux"));
  await ov.waitForFunction(() => document.querySelector(".sillonette").classList.contains("is-visible"), null, { timeout: 2000 });
  await ov.close();

  await page.check('input[name="vis"][value="always"]');
  await page.waitForFunction(async () => (await chrome.storage.local.get("theme")).theme?.nt === 0, null, { timeout: 3000 });
  assert.equal(await page.isDisabled("#nt"), true);
  await page.close();
});

test("options: popup button, popup keeps the custom settings, invalid and old saved settings", async () => {
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  // custom colour first, then a layout change in the popup keeps it
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "studio", ac: "#123456", nt: 15 } }));
  await popup.reload();
  await popup.selectOption("#layout", "c");
  await sleep(300);
  let th = await stored();
  assert.equal(th.ac, "#123456");
  assert.equal(th.nt, 15);
  assert.equal(th.ly, "c");
  await popup.selectOption("#skin", "arcade"); // another skin: its colours, the behaviour stays
  await sleep(300);
  th = await stored();
  assert.deepEqual([th.sk, th.ac, th.nt, th.ly], ["arcade", "#ffd23f", 15, "c"]);
  const [opened] = await Promise.all([ctx.waitForEvent("page"), popup.click("#customize")]);
  await opened.waitForLoadState();
  assert.equal(opened.url(), `chrome-extension://${extId}/options.html`);
  await opened.close();
  if (!popup.isClosed()) await popup.close();

  // invalid values -> the skin's; old format (0.1.x: skin + layout only) still read
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "vinyle", ac: "rouge", nt: 2, er: 7, sc: 999, zz: 1 } }));
  let page = await openOptions();
  assert.deepEqual(await page.evaluate(() => [document.getElementById("sk").value, document.getElementById("ac").value, document.getElementById("sc").value, document.querySelector('input[name="vis"]:checked').value, document.getElementById("er").checked]), ["vinyle", "#d4ae66", "100", "always", true]);
  assert.equal(await page.isDisabled("#as"), true, "Vinyle ignores the artwork shape");
  await page.close();
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "retro", ly: "v" } }));
  page = await openOptions();
  assert.deepEqual(await page.evaluate(() => [document.getElementById("sk").value, document.querySelector('input[name="ly"]:checked').value]), ["retro", "v"]);
  await page.close();
});

test("options: keyboard only, visible focus, axe-core WCAG 2.1 AA", async () => {
  const page = await openOptions();
  // every control is reachable with Tab, in order, and shows its focus
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      return { id: el.id || el.getAttribute("name") + ":" + el.getAttribute("value"), ring: getComputedStyle(el).boxShadow };
    });
    if (info.id === "reset") assert.notEqual(info.ring, "none", "visible focus");
    seen.add(info.id);
  }
  for (const id of ["sk", "ac", "ba", "ft", "sc", "an", "pa", "lg", "er", "reset"]) assert.ok(seen.has(id), id + " reachable with Tab");
  await page.focus("#sk");
  await page.keyboard.press("ArrowDown"); // studio -> neon (or next)
  await page.waitForFunction(async () => (await chrome.storage.local.get("theme")).theme?.sk !== "retro", null, { timeout: 3000 });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    // the extension page's CSP refuses inline scripts: axe is evaluated by the test driver instead
    if ((await page.evaluate(() => typeof window.axe)) !== "object") await page.evaluate(AXE);
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    assert.deepEqual(res.violations.map((v) => v.id + ": " + v.nodes.length), [], "axe violations at " + width + " px");
    assert.ok(res.passes.length > 10, "axe really ran");
  }
  await page.screenshot({ path: join(OUT, "options-mobile.png"), fullPage: true });
  await page.close();
  const csp = consoleErrors.filter((e) => /Content Security Policy|Refused/.test(e));
  assert.deepEqual(csp, [], "no CSP error on the options page or in its preview");
});

test("options: live preview (the real track, E10 included, works without OBS, nothing more sent)", async () => {
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "studio" } }));
  const page = await openOptions();
  const fr = () => frameOf(page);
  const conns = obs.log.connections, reqs = obs.log.requests.length;
  await page.check('input[name="mode"][value="live"]');
  await page.waitForFunction(() => document.getElementById("frame").getAttribute("src").startsWith("apercu/apercu.html?direct#"));
  await page.waitForFunction(() => document.getElementById("liveHint").textContent.startsWith("Aucune musique ne joue"), null, { timeout: 5000 });
  assert.equal(await fr().evaluate(() => document.querySelector(".sillonette").classList.contains("is-visible")), false, "nothing plays: hidden");
  const yt = await ctx.newPage();
  await yt.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt.evaluate(() => { setTrack("Morceau en direct", "Artiste direct"); return play(); });
  await page.waitForFunction(() => {
    const d = document.getElementById("frame").contentDocument;
    return d.querySelector(".title > span")?.textContent === "Morceau en direct" && d.querySelector(".sillonette").classList.contains("is-visible");
  }, null, { timeout: 6000 });
  assert.match(await page.textContent("#liveHint"), /^En direct : le morceau que Sillonette envoie à OBS/);
  // the real cover, from a Google host (answered locally by the test): allowed by the CSPs
  await page.waitForFunction(() => {
    const img = document.getElementById("frame").contentDocument.querySelector(".art img");
    return img.getAttribute("src").startsWith("https://lh3.googleusercontent.com/") && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 5000 });
  // a setting changes the live preview at once
  await page.fill("#ac", "#12ab34");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("frame").contentDocument.documentElement).getPropertyValue("--o-accent").trim() === "#12ab34", null, { timeout: 3000 });
  // a second tab: E10 in the live preview, as in OBS
  const yt2 = await ctx.newPage();
  await yt2.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt2.evaluate(() => { setTrack("Second onglet", "Autre"); return play(); });
  await page.waitForFunction(() => document.getElementById("frame").contentDocument.querySelector(".sillonette-err").dataset.code === "E10", null, { timeout: 6000 });
  await yt2.close();
  assert.equal(obs.log.connections, conns, "the page opened no connection to OBS");
  assert.ok(obs.log.requests.slice(reqs).every((r) => r.requestData.requestType === "emit_event"), "only the usual emit_event");
  await page.screenshot({ path: join(OUT, "options-direct.png"), fullPage: true });
  // without OBS: the live preview keeps following the tab
  await obs.stop();
  await yt.evaluate(() => setTrack("Sans OBS", "Artiste direct"));
  await page.waitForFunction(() => document.getElementById("frame").contentDocument.querySelector(".title > span")?.textContent === "Sans OBS", null, { timeout: 6000 });
  await yt.evaluate(() => pause());
  await page.waitForFunction(() => document.getElementById("frame").contentDocument.querySelector(".sillonette").dataset.state === "paused", null, { timeout: 6000 });
  await yt.close();
  await page.waitForFunction(() => document.getElementById("liveHint").textContent.startsWith("Aucune musique ne joue"), null, { timeout: 6000 });
  // back to the demo
  await page.check('input[name="mode"][value="demo"]');
  await page.waitForFunction(() => /^(Nuage pêche|Ciel de beurre|Framboise)/.test(document.getElementById("frame").contentDocument?.querySelector(".title > span")?.textContent ?? ""), null, { timeout: 6000 });
  assert.equal(await page.textContent("#liveHint"), "");
  await page.close();
  assert.deepEqual(consoleErrors.filter((e) => /Content Security Policy|Refused/.test(e)), [], "no CSP error");
});
