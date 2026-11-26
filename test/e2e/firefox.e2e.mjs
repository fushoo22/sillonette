// The extension in headless Firefox (throw-away profile, Marionette): checks that the event page
// really opens ws://127.0.0.1 (Firefox MV3's default CSP has "upgrade-insecure-requests", which the
// build replaces) and sends the track. Also runs a build WITHOUT the CSP override to show the default.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildForTests, freePort, ROOT, sleep } from "./lib.mjs";
import { launchFirefox } from "./marionette.mjs";
import { startFakeObs } from "./fake-obs.mjs";
import { UI } from "../../src/shared/ui-text.ts";

// The popup speaks the language of this Firefox (French or English): both are accepted.
const CONNECTED = [UI.fr.st_ok, UI.en.st_ok];

const UUID = "4b1d9a10-5c2e-4f7a-8e3b-2a6c9d0e1f21";
const ID = "sillonette@fushoo.fr";
const PASSWORD = "essai-firefox-" + Math.random().toString(36).slice(2);
let site, dist;

before(async () => {
  dist = buildForTests(join(ROOT, "dist/e2e-ff"));
  const html = readFileSync(join(ROOT, "test/e2e/fake-ytmusic.html"));
  site = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
});
after(() => site?.close());

async function run(extDir) {
  const ff = await launchFirefox({ "extensions.webextensions.uuids": JSON.stringify({ [ID]: UUID }) });
  let q = Promise.resolve(); // Marionette drives one window at a time: serialise every command
  const serial = (fn) => (q = q.then(fn, fn));
  const port = await freePort();
  const obs = await startFakeObs({ port, password: PASSWORD });
  try {
    await serial(() => ff.send("Addon:Install", { path: extDir, temporary: true }));
    const popup = await serial(() => ff.openTab(`moz-extension://${UUID}/popup.html`));
    await serial(() => ff.evalIn(popup, `document.getElementById("port").value = "${port}"; document.getElementById("password").value = ${JSON.stringify(PASSWORD)}; document.getElementById("save").click()`));
    let status = "";
    for (let i = 0; i < 40 && !CONNECTED.includes(status); i++) {
      await sleep(250);
      status = await serial(() => ff.evalIn(popup, `return document.getElementById("status").textContent`));
    }
    const result = { status, connections: obs.log.connections, requests: obs.log.requests.length };
    if (CONNECTED.includes(status)) {
      // The overlay itself always runs in OBS (Chromium/CEF), never in Firefox: check what Firefox sends.
      const yt = await serial(() => ff.openTab(`http://127.0.0.1:${site.address().port}/watch`));
      await serial(() => ff.evalIn(yt, `setTrack("Morceau Firefox", "Artiste FF"); play()`));
      const seen = () => obs.log.requests.some((r) => r.requestData?.requestData?.event_data?.np?.title === "Morceau Firefox");
      for (let i = 0; i < 40 && !seen(); i++) await sleep(250);
      result.sent = seen();
      result.onlyEmit = obs.log.requests.every((r) => r.requestType === "CallVendorRequest" && r.requestData.requestType === "emit_event");
      result.origin = obs.log.origins[0];
      // can storage.local be closed to content scripts here? (logged: documented in docs/TECHNIQUE.md)
      // options page: the preview (overlay copy, demo mode) runs under the extension CSP, a change is saved and sent
      const opt = await serial(() => ff.openTab(`moz-extension://${UUID}/options.html`));
      const previewOk = `const d = document.getElementById("frame").contentDocument; const c = d && d.querySelector(".sillonette"); return !!c && c.dataset.state === "playing" && c.classList.contains("is-visible") && [...d.fonts].some((f) => f.family === "Mochiy Pop One" && f.status === "loaded")`;
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        await sleep(250);
        ok = await serial(() => ff.evalIn(opt, previewOk));
      }
      result.optionsPreview = ok;
      await serial(() => ff.evalIn(opt, `const r = document.querySelector('input[name="vis"][value="brief"]'); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true }))`));
      const brief = () => obs.log.requests.some((r) => {
        const t = r.requestData?.requestData?.event_data?.theme;
        return typeof t === "string" && JSON.parse(Buffer.from(t, "base64url").toString()).nt === 10;
      });
      for (let i = 0; i < 40 && !brief(); i++) await sleep(250);
      result.optionsSent = brief();
      result.localAccessLevel = await serial(() => ff.evalIn(popup, `const f = browser.storage.local.setAccessLevel; return f ? f({ accessLevel: "TRUSTED_CONTEXTS" }).then(() => "ok", (e) => "ERR " + e.message) : "absent"`));
    }
    return result;
  } finally {
    await obs.stop();
    await ff.close();
  }
}

test("Firefox: extension (event page) -> ws://127.0.0.1 -> fake OBS", async () => {
  const r = await run(join(dist, "firefox"));
  console.log("firefox:", JSON.stringify(r));
  assert.ok(CONNECTED.includes(r.status), r.status);
  assert.equal(r.sent, true);
  assert.equal(r.onlyEmit, true);
  assert.equal(r.optionsPreview, true, "options page preview works in Firefox");
  assert.equal(r.optionsSent, true, "a setting of the options page reaches OBS");
});

test("Firefox: without the CSP override, what happens to ws://127.0.0.1", async () => {
  const m = JSON.parse(readFileSync(join(dist, "firefox/manifest.json"), "utf8"));
  delete m.content_security_policy;
  writeFileSync(join(dist, "firefox/manifest.json"), JSON.stringify(m, null, 2));
  const r = await run(join(dist, "firefox"));
  console.log("firefox, default MV3 CSP:", JSON.stringify(r));
  assert.ok(!CONNECTED.includes(r.status), "if this starts passing, Firefox stopped upgrading ws:// and the override may go");
});
