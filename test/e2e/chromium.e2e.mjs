// End to end in headless, muted Chromium:
// fake YouTube Music tab -> real extension (test build) -> fake OBS (obs-websocket v5 + obs-browser
// emit_event, test/e2e/fake-obs.mjs) -> real overlay opened as a file:// page.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { buildForTests, freePort, isolate, CHROMIUM, ROOT, OUT, sleep } from "./lib.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const PASSWORD = "mdp-essai-é😀-" + Math.random().toString(36).slice(2); // test-only password
let ctx, site, profile, extId, sw, obs, obsPort, dist;
const overlays = new Set();
const failed = [];

function emitToOverlays(name, json) {
  // what obs-browser does in each browser source: window.dispatchEvent(new CustomEvent(name, { detail }))
  for (const p of overlays) p.evaluate(([n, j]) => window.dispatchEvent(new CustomEvent(n, { detail: JSON.parse(j) })), [name, json]).catch(() => undefined);
}
const startObs = async (opts = {}) => (obs = await startFakeObs({ port: obsPort, password: PASSWORD, onEmit: emitToOverlays, ...opts }));

before(async () => {
  dist = buildForTests(join(ROOT, "dist/e2e"));
  obsPort = await freePort();
  await startObs();
  const html = readFileSync(join(ROOT, "test/e2e/fake-ytmusic.html"));
  site = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  profile = mkdtempSync(join(tmpdir(), "sillonette-e2e-"));
  const dir = join(dist, "chrome");
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM, headless: true, viewport: { width: 800, height: 200 }, locale: "fr-FR",
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  await isolate(ctx);
  await ctx.route((u) => u.protocol === "file:", (route) => route.continue()); // the local overlay itself
  ctx.on("requestfailed", (r) => failed.push(r.url().slice(0, 100) + " " + r.failure()?.errorText));
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
});

after(async () => {
  await ctx?.close();
  site?.close();
  await obs?.stop();
  if (profile) rmSync(profile, { recursive: true, force: true });
});

const ytUrl = () => `http://127.0.0.1:${site.address().port}/watch`;
const overlayUrl = () => pathToFileURL(join(dist, "overlay/sillonette-overlay.html")).href;
async function openOverlay() {
  const p = await ctx.newPage();
  await p.goto(overlayUrl());
  overlays.add(p);
  return p;
}
async function waitOverlay(p, st, title, timeout = 8000) {
  await p.waitForFunction(([s, t]) => document.querySelector(".sillonette").dataset.state === s && (t === null || document.querySelector(".title > span").textContent === t), [st, title], { timeout });
}
const statusText = (popup) => popup.textContent("#status");

test("YouTube Music tab -> extension -> obs-websocket -> obs-browser event -> file:// overlay", async () => {
  // 1. popup: port + password
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.fill("#port", String(obsPort));
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 8000 });
  assert.equal(await popup.inputValue("#password"), "", "the saved password is never shown again");
  await popup.screenshot({ path: join(OUT, "popup.png"), fullPage: true });

  // 2. overlay as a local file, then a playing tab
  const ov = await openOverlay();
  const yt = await ctx.newPage();
  await yt.goto(ytUrl());
  await yt.evaluate(() => { setTrack("Morceau essai", "Artiste essai"); return play(); });
  const t0 = Date.now();
  await waitOverlay(ov, "playing", "Morceau essai");
  console.log(`e2e: first display ${Date.now() - t0} ms`);
  const lat = [];
  for (const title of ["Deuxième", "Troisième"]) {
    const t = Date.now();
    await yt.evaluate((x) => setTrack(x, "Artiste essai"), title);
    await waitOverlay(ov, "playing", title);
    lat.push(Date.now() - t);
  }
  console.log(`e2e: track changes ${lat.join(" / ")} ms`);
  assert.ok(Math.max(...lat) < 1500);
  assert.equal(await ov.evaluate(() => document.querySelector(".art img").getAttribute("src")), "https://lh3.googleusercontent.com/e2e=w544-h544-l90-rj");
  // the settings survive obs-browser's obs_data round trip (arrays of strings would be dropped there)
  assert.deepEqual(await ov.evaluate(() => ["art", "artist", "prog"].map((k) => document.querySelector(".sillonette").classList.contains("show-" + k))), [true, true, true]);
  assert.ok(await ov.evaluate(() => document.querySelector(".artist").getBoundingClientRect().height > 0), "artist visible");
  // file:// really loads the script (it rendered), the CSS and the inlined fonts
  const fonts = await ov.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family); });
  assert.ok(fonts.includes("Mochiy Pop One") && fonts.includes("Nunito Variable"), "studio fonts loaded: " + fonts);
  assert.ok(await ov.evaluate(() => getComputedStyle(document.querySelector(".sillonette")).borderRadius !== "0px"), "overlay.css applied");
  await ov.screenshot({ path: join(OUT, "overlay-studio.png") });

  // 3. skin and layout from the popup travel inside the event
  await popup.selectOption("#skin", "neon");
  await popup.selectOption("#layout", "v");
  await ov.setViewportSize({ width: 300, height: 460 });
  await ov.waitForFunction(() => document.querySelector(".sillonette").dataset.skin === "neon" && document.querySelector(".sillonette").dataset.layout === "v", null, { timeout: 4000 });
  await ov.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("o-loading"), null, { timeout: 4000 });
  const neonFonts = await ov.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family); });
  assert.ok(neonFonts.includes("Space Grotesk Variable"), "neon font loaded over file://");
  assert.equal(await ov.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--o-accent").trim()), "#ff4fd8");
  await ov.screenshot({ path: join(OUT, "overlay-neon-v.png") });
  await popup.selectOption("#skin", "lofi");
  await popup.selectOption("#layout", "h");
  await ov.setViewportSize({ width: 800, height: 200 });
  await ov.waitForFunction(() => document.querySelector(".sillonette").dataset.skin === "lofi" && !document.querySelector(".sillonette").classList.contains("o-loading"), null, { timeout: 4000 });
  await sleep(300);
  await ov.screenshot({ path: join(OUT, "overlay-lofi-h.png") }); // mascot SVG over file://

  // 4. one source at a time: a second tab is refused (E10), takes over when the first closes
  const yt2 = await ctx.newPage();
  await yt2.goto(ytUrl());
  await yt2.evaluate(() => { setTrack("Second onglet", "Autre"); return play(); });
  await ov.waitForFunction(() => document.querySelector(".sillonette-err").dataset.code === "E10", null, { timeout: 5000 });
  assert.equal(await ov.textContent(".title > span"), "Troisième", "the first tab keeps the overlay");
  await popup.waitForFunction(() => !document.getElementById("conflict").hidden, null, { timeout: 3000 });
  await ov.screenshot({ path: join(OUT, "overlay-E10.png") });
  await yt.close();
  await waitOverlay(ov, "playing", "Second onglet", 5000);
  await ov.waitForFunction(() => document.querySelector(".sillonette-err").hidden, null, { timeout: 3000 });

  // 5. an OBS browser source (re)loaded later catches up through the periodic resend
  const ov2 = await openOverlay();
  const t1 = Date.now();
  await waitOverlay(ov2, "playing", "Second onglet", 7000);
  console.log(`e2e: reloaded source in sync after ${Date.now() - t1} ms`);
  await ov2.close();
  overlays.delete(ov2);

  // 6. OBS restarts: the extension reconnects by itself and the new source shows the track
  await obs.stop();
  await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("OBS introuvable"), null, { timeout: 5000 });
  await sleep(2000);
  const before = obs.log;
  await startObs();
  const t2 = Date.now();
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 20000 });
  await waitOverlay(ov, "playing", "Second onglet", 7000);
  console.log(`e2e: reconnected to the restarted OBS after ${Date.now() - t2} ms`);

  // 7. pause, then tab closed: emptied at once
  await yt2.evaluate(() => pause());
  await waitOverlay(ov, "paused", "Second onglet");
  await yt2.evaluate(() => play());
  await waitOverlay(ov, "playing", "Second onglet");
  await yt2.close();
  await ov.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("is-visible"), null, { timeout: 3000 });

  // 8. wrong password: clear status, no retry storm; the right one connects again
  await popup.fill("#password", "faux");
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("Mot de passe refusé par OBS"), null, { timeout: 5000 });
  await popup.screenshot({ path: join(OUT, "popup-auth.png"), fullPage: true });
  await sleep(3000);
  assert.equal(obs.log.authFailures, 1, "no retry storm after a refused password");
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 5000 });

  // 8b. "remember" unchecked: the password lives in storage.session only (memory), not on disk
  const areas = () => sw.evaluate(async () => [(await chrome.storage.local.get("obsPassword")).obsPassword ?? null, (await chrome.storage.session.get("obsPassword")).obsPassword ?? null]);
  await popup.uncheck("#remember");
  await popup.click("#save"); // empty field: the saved password moves
  await popup.waitForFunction(() => document.getElementById("pwHint").textContent.startsWith("Un mot de passe est en mémoire"), null, { timeout: 3000 });
  assert.deepEqual(await areas(), [null, PASSWORD]);
  await sleep(500);
  assert.equal(await statusText(popup), "Connecté à OBS.", "still connected");
  // 8c. forget: gone from both areas, disconnected, and OBS gets no further attempt
  const failuresBefore = obs.log.authFailures, identifiesBefore = obs.log.identifies.length;
  await popup.click("#forget");
  await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("OBS demande son mot de passe"), null, { timeout: 5000 });
  assert.deepEqual(await areas(), [null, null]);
  assert.equal(await popup.isDisabled("#forget"), true);
  await sleep(1500);
  assert.equal(obs.log.identifies.length, identifiesBefore, "nothing sent without a password");
  assert.equal(obs.log.authFailures, failuresBefore);
  await popup.screenshot({ path: join(OUT, "popup-oublie.png"), fullPage: true });
  // short password: warning (obs-websocket has no attempt limit)
  await popup.check("#remember");
  await popup.fill("#password", "court1");
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("pwHint").textContent.includes("mot de passe court"), null, { timeout: 3000 });
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 5000 });
  assert.deepEqual(await areas(), [PASSWORD, null]);

  // 8d. the content script (inside the YouTube Music tab's process) cannot read the extension's storage
  const probe = await ctx.newPage();
  await probe.goto(ytUrl());
  const cdp = await ctx.newCDPSession(probe);
  const contexts = [];
  cdp.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
  await cdp.send("Runtime.enable");
  await sleep(300);
  const iso = contexts.find((c) => c.auxData?.type === "isolated" && c.origin?.includes(extId)) ?? contexts.find((c) => c.auxData?.type === "isolated");
  assert.ok(iso, "content script world found: " + JSON.stringify(contexts.map((c) => [c.name, c.origin, c.auxData?.type])));
  const read = async (area) => (await cdp.send("Runtime.evaluate", {
    contextId: iso.id, awaitPromise: true, returnByValue: true,
    expression: `chrome.storage.${area}.get(null).then((x) => "READ " + Object.keys(x).join(","), (e) => "ERR " + e.message)`,
  })).result.value;
  const fromContent = { local: await read("local"), session: await read("session") };
  console.log("e2e: storage seen from the content script", JSON.stringify(fromContent));
  assert.match(fromContent.local, /^ERR /);
  assert.match(fromContent.session, /^ERR /);
  await probe.close();

  // 9. security: the only request is CallVendorRequest obs-browser/emit_event, no event subscription,
  //    the password never crosses the wire, the extension cannot reach anything but ws://127.0.0.1
  for (const log of [before, obs.log]) {
    assert.ok(log.requests.length > 0);
    for (const r of log.requests) {
      assert.equal(r.requestType, "CallVendorRequest");
      assert.equal(r.requestData.vendorName, "obs-browser");
      assert.equal(r.requestData.requestType, "emit_event");
      assert.equal(r.requestData.requestData.event_name, "sillonette");
    }
    for (const d of log.identifies) assert.equal(d.eventSubscriptions, 0);
    for (const raw of log.raw) assert.ok(!raw.includes(PASSWORD) && !raw.includes("mdp-essai"), "password on the wire");
    for (const o of log.origins) assert.equal(o, `chrome-extension://${extId}`);
  }
  // CSP of the extension (connect-src ws://127.0.0.1:* only): plain HTTP to a live local server and a
  // WebSocket to the same fake OBS through "localhost" are both refused before any connection.
  const conns = obs.log.connections;
  const blocked = await sw.evaluate(async ([sitePort, wsPort]) => {
    const out = {};
    try { await fetch(`http://127.0.0.1:${sitePort}/watch`); out.fetch = "allowed"; } catch (e) { out.fetch = String(e).slice(0, 60); }
    out.ws = await new Promise((resolve) => {
      try {
        const ws = new WebSocket(`ws://localhost:${wsPort}`, "obswebsocket.json");
        ws.onopen = () => { ws.close(); resolve("allowed"); };
        ws.onerror = () => resolve("error event");
      } catch (e) { resolve(String(e).slice(0, 60)); }
    });
    return out;
  }, [site.address().port, obsPort]);
  console.log("e2e: extension CSP", JSON.stringify(blocked));
  assert.notEqual(blocked.fetch, "allowed");
  assert.notEqual(blocked.ws, "allowed");
  assert.equal(obs.log.connections, conns, "no connection reached the server");
  const stored = await sw.evaluate(async () => [await chrome.storage.local.get(null), await chrome.storage.session.get(null)]);
  assert.equal(stored[0].obsPassword, PASSWORD, "password in storage.local");
  assert.ok(!JSON.stringify(stored[1]).includes(PASSWORD), "not in storage.session");
  const outside = failed.filter((f) => !f.includes("ERR_ABORTED") || !/^https?:\/\/(127\.0\.0\.1|lh3)/.test(f));
  console.log("e2e: failed requests", JSON.stringify(failed));

  // 9b. an OBS that asks for no password at all: connected, but the popup warns
  await obs.stop();
  await startObs({ password: "" });
  await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("Connecté, mais OBS n'exige AUCUN mot de passe"), null, { timeout: 20000 });
  assert.equal(await popup.getAttribute("#dot", "class"), "dot warn");
  assert.ok(obs.log.identifies.every((d) => !("authentication" in d)));
  await popup.screenshot({ path: join(OUT, "popup-sans-mdp.png"), fullPage: true });
  await obs.stop();
  await startObs();
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 20000 });

  // 10. browser gone (no more events): the overlay hides by itself after 20 s
  const yt3 = await ctx.newPage();
  await yt3.goto(ytUrl());
  await yt3.evaluate(() => { setTrack("Dernier", "Artiste"); return play(); });
  await waitOverlay(ov, "playing", "Dernier");
  await obs.stop(); // nothing reaches the overlay any more
  await sleep(21_000);
  assert.equal(await ov.evaluate(() => document.querySelector(".sillonette").classList.contains("is-visible")), false, "stale overlay hidden");
  assert.deepEqual(outside.filter((f) => f.startsWith("file:")), [], "no file:// load failed");
});
