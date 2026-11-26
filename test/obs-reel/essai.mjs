// Manual trial with a REAL OBS (not part of npm run e2e).
// OBS is started with a throw-away configuration (HOME and XDG_CONFIG_HOME in WORK), obs-websocket on
// 127.0.0.1:PORT with a random test password, no stream, no recording. The harness (this script) adds
// a "Local file" browser source pointing at dist/e2e/overlay, then a muted headless Chromium with
// the extension (test build) plays the fake YouTube Music page. Proof: GetSourceScreenshot of the source.
//   node test/obs-reel/essai.mjs WORK OUT        (needs a display for OBS: WAYLAND_DISPLAY or DISPLAY)
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildForTests, CHROMIUM, ROOT, isolate, sleep } from "../e2e/lib.mjs";

const [WORK, OUT] = process.argv.slice(2);
if (!WORK || !OUT) throw new Error("usage: essai.mjs WORK OUT");
const PORT = 14455;
const PASSWORD = randomBytes(12).toString("base64url"); // test-only, never reused
const SOURCE = "Sillonette essai";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- throw-away OBS configuration
const home = join(WORK, "home"), cfg = join(home, ".config"), obsCfg = join(cfg, "obs-studio");
rmSync(home, { recursive: true, force: true });
mkdirSync(join(obsCfg, "plugin_config/obs-websocket"), { recursive: true });
mkdirSync(join(home, ".cache"), { recursive: true });
writeFileSync(join(obsCfg, "global.ini"), `[General]\nMaxLogs=3\nEnableAutoUpdates=false\nBrowserHWAccel=false\n[Locations]\nConfiguration=${cfg}\nSceneCollections=${cfg}\nProfiles=${cfg}\nPluginManagerSettings=${cfg}\n`);
writeFileSync(join(obsCfg, "user.ini"), "[General]\nFirstRun=false\nEnableAutoUpdates=false\nConfirmOnExit=false\nWarnBeforeStartingStream=true\nWarnBeforeStartingRecording=true\n[BasicWindow]\nSysTrayEnabled=false\n");
writeFileSync(join(obsCfg, "plugin_config/obs-websocket/config.json"), JSON.stringify({ alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: PASSWORD, server_port: PORT }));

const env = {
  PATH: "/usr/bin", HOME: home, XDG_CONFIG_HOME: cfg, XDG_CACHE_HOME: join(home, ".cache"), LANG: "fr_FR.UTF-8",
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "", WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? "", DISPLAY: process.env.DISPLAY ?? "", QT_QPA_PLATFORM: "wayland",
};
const obsLog = [];
let obsProc;
function startObs() {
  obsProc = spawn("/usr/bin/obs", ["--multi", "--disable-shutdown-check"], { cwd: home, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  writeFileSync(join(OUT, "obs.pid"), String(obsProc.pid));
  obsProc.stdout.on("data", (d) => obsLog.push(String(d)));
  obsProc.stderr.on("data", (d) => obsLog.push(String(d)));
  log("OBS pid", obsProc.pid);
}
async function stopObs() {
  if (!obsProc || obsProc.exitCode !== null) return;
  try { process.kill(obsProc.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 20 && obsProc.exitCode === null; i++) await sleep(500);
  if (obsProc.exitCode === null) try { process.kill(obsProc.pid, "SIGKILL"); } catch {}
  for (let i = 0; i < 10 && obsProc.exitCode === null; i++) await sleep(300);
  log("OBS exited", obsProc.exitCode, obsProc.signalCode);
}
startObs();

// ---- harness obs-websocket client (setup and screenshots only; the extension uses its own client)
const sha = (s) => createHash("sha256").update(s).digest("base64");
/** A raw obs-websocket connection (protocol checks): resolves with the Hello, then reports what follows. */
function raw({ identify, origin } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, "obswebsocket.json");
    const out = { hello: null, events: 0, identified: false, closeCode: null, ws };
    ws.onerror = () => reject(new Error("ws error"));
    ws.onclose = (e) => { out.closeCode = e.code; resolve(out); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.op === 0) {
        out.hello = m.d;
        if (!identify) return resolve(out);
        ws.send(JSON.stringify({ op: 1, d: identify(m.d) }));
      } else if (m.op === 2) { out.identified = true; resolve(out); }
      else if (m.op === 5) out.events++;
    };
  });
}
const goodAuth = (h) => sha(sha(PASSWORD + h.authentication.salt) + h.authentication.challenge);
async function connectHarness() {
  for (let i = 0; i < 60; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, "obswebsocket.json");
        const pending = new Map();
        let n = 0;
        ws.onerror = () => reject(new Error("ws error"));
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.op === 0) {
            const a = m.d.authentication;
            ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, ...(a ? { authentication: sha(sha(PASSWORD + a.salt) + a.challenge) } : {}) } }));
          } else if (m.op === 2) {
            resolve({
              hello: m.d,
              call: (requestType, requestData = {}) => new Promise((res) => {
                const requestId = "h" + ++n;
                pending.set(requestId, res);
                ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
              }),
              close: () => ws.close(),
            });
          } else if (m.op === 7) pending.get(m.d.requestId)?.(m.d);
        };
      });
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("OBS websocket never answered:\n" + obsLog.join("").slice(-3000));
}

let ctx, site, profile;
const shot = async (h, name) => {
  const r = await h.call("GetSourceScreenshot", { sourceName: SOURCE, imageFormat: "png", imageWidth: 800, imageHeight: 200 });
  if (!r.requestStatus.result) throw new Error("screenshot: " + JSON.stringify(r.requestStatus));
  writeFileSync(join(OUT, name), Buffer.from(r.responseData.imageData.split(",")[1], "base64"));
  log("screenshot", name);
};

try {
  const h = await connectHarness();
  const ver = await h.call("GetVersion");
  log("OBS", ver.responseData.obsVersion, "obs-websocket", ver.responseData.obsWebSocketVersion, "formats", ver.responseData.supportedImageFormats.includes("png"));
  // ---- protocol facts, checked on this real OBS (no secret printed)
  try {
    const ss = execFileSync("ss", ["-Hltn", `sport = :${PORT}`], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/)[3]);
    log("listening on", JSON.stringify(ss), "(not only 127.0.0.1: obs-websocket has no bind-address setting)");
  } catch (e) { log("ss failed", String(e).slice(0, 80)); }
  const h1 = await raw(), h2 = await raw();
  h1.ws.close(); h2.ws.close();
  log("Hello:", JSON.stringify({ ...h1.hello, authentication: h1.hello.authentication ? "{challenge, salt}" : undefined }));
  log("same salt for two sessions:", h1.hello.authentication.salt === h2.hello.authentication.salt, "· same challenge:", h1.hello.authentication.challenge === h2.hello.authentication.challenge);
  const saltRun1 = h1.hello.authentication.salt;
  const secretRun1 = sha(PASSWORD + saltRun1); // what a client could store instead of the password
  // eventSubscriptions: 0 (what the extension sends) vs. left out (= All)
  const quiet = await raw({ identify: (hd) => ({ rpcVersion: 1, eventSubscriptions: 0, authentication: goodAuth(hd) }) });
  const chatty = await raw({ identify: (hd) => ({ rpcVersion: 1, authentication: goodAuth(hd) }) });
  await h.call("CreateScene", { sceneName: "essai-evenements" });
  await h.call("RemoveScene", { sceneName: "essai-evenements" });
  await sleep(1000);
  log("events received: eventSubscriptions 0 ->", quiet.events, "· left out ->", chatty.events);
  quiet.ws.close(); chatty.ws.close();
  // attempt limit: 25 wrong answers in a row, then the right one
  const t0 = Date.now();
  const codes = [];
  for (let i = 0; i < 25; i++) codes.push((await raw({ identify: () => ({ rpcVersion: 1, eventSubscriptions: 0, authentication: "faux" + i }) })).closeCode);
  const after = await raw({ identify: (hd) => ({ rpcVersion: 1, eventSubscriptions: 0, authentication: goodAuth(hd) }) });
  after.ws.close();
  log(`25 wrong answers in ${Date.now() - t0} ms, close codes:`, [...new Set(codes)].join(","), "· right one just after accepted:", after.identified);
  const scene = (await h.call("GetCurrentProgramScene")).responseData.currentProgramSceneName;

  // keep OBS silent: mute every audio input the default scene collection created
  for (const i of (await h.call("GetInputList")).responseData.inputs) await h.call("SetInputMute", { inputName: i.inputName, inputMuted: true });
  const dist = buildForTests(join(ROOT, "dist/e2e"));
  const overlay = join(dist, "overlay/sillonette-overlay.html");
  const created = await h.call("CreateInput", {
    sceneName: scene, inputName: SOURCE, inputKind: "browser_source",
    inputSettings: { is_local_file: true, local_file: overlay, width: 800, height: 200, reroute_audio: true, shutdown: false, restart_when_active: false },
  });
  log("browser source", created.requestStatus.result ? "created" : JSON.stringify(created.requestStatus));
  await h.call("SetInputMute", { inputName: SOURCE, inputMuted: true });
  await sleep(4000);
  await shot(h, "obs-0-vide.png");

  // ---- browser with the local extension (test profile, headless, muted)
  const html = readFileSync(join(ROOT, "test/e2e/fake-ytmusic.html"));
  site = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  profile = mkdtempSync(join(WORK, "chromium-"));
  const dir = join(dist, "chrome");
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM, headless: true, locale: "fr-FR",
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  await isolate(ctx);
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.fill("#port", String(PORT));
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 15000 });
  log("extension: connected to the real OBS");
  await popup.screenshot({ path: join(OUT, "popup-connecte.png") });

  const yt = await ctx.newPage();
  await yt.goto(`http://127.0.0.1:${site.address().port}/watch`);
  // Origin: an ordinary web page (origin http://127.0.0.1:<port>) is let in too (it gets the Hello)
  const fromPage = await yt.evaluate((port) => new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, "obswebsocket.json");
    ws.onmessage = (e) => { const m = JSON.parse(e.data); ws.close(); res("op " + m.op + " rpcVersion " + m.d.rpcVersion); };
    ws.onerror = () => res("error");
  }), PORT);
  log("web page origin", new URL(yt.url()).origin, "->", fromPage);
  await yt.evaluate(() => { setTrack("Essai OBS réel", "Sillonette"); return play(); });
  await sleep(3000);
  await shot(h, "obs-1-lecture-studio.png");

  await popup.selectOption("#skin", "lofi");
  await sleep(2500);
  await shot(h, "obs-2-skin-lofi.png");

  const yt2 = await ctx.newPage();
  await yt2.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt2.evaluate(() => { setTrack("Second onglet", "Autre"); return play(); });
  await sleep(3000);
  await shot(h, "obs-3-E10.png");

  // reload the browser source (OBS "Refresh cache of current page"): resync by the 5 s resend
  await yt.close();
  await sleep(2000);
  await h.call("PressInputPropertiesButton", { inputName: SOURCE, propertyName: "refreshnocache" });
  await sleep(7000);
  await shot(h, "obs-4-source-rechargee.png");

  await yt2.evaluate(() => pause());
  await sleep(2000);
  await shot(h, "obs-5-pause.png");
  await yt2.close();
  await sleep(2000);
  await shot(h, "obs-6-onglet-ferme.png");

  // forget the password: the extension stops, OBS sees no further attempt
  const fails = () => (obsLog.join("").match(/code `4009`/g) ?? []).length;
  const f0 = fails();
  await popup.click("#forget");
  await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("OBS demande son mot de passe"), null, { timeout: 10000 });
  await popup.screenshot({ path: join(OUT, "popup-oublie.png") });
  await sleep(3000);
  log("after forget:", await popup.textContent("#status"), "· new auth failures in OBS log:", fails() - f0);
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 15000 });

  // OBS restart: new salt (a stored secret would be useless), the remembered password reconnects
  const yt4 = await ctx.newPage();
  await yt4.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt4.evaluate(() => { setTrack("Après redémarrage d'OBS", "Sillonette"); return play(); });
  h.close();
  writeFileSync(join(OUT, "obs-stdout-1.log"), obsLog.join(""));
  await stopObs();
  obsLog.length = 0;
  startObs();
  const hb = await connectHarness();
  const h3 = await raw();
  h3.ws.close();
  log("salt changed after OBS restart:", h3.hello.authentication.salt !== saltRun1);
  const old = await raw({ identify: (hd) => ({ rpcVersion: 1, eventSubscriptions: 0, authentication: sha(secretRun1 + hd.authentication.challenge) }) });
  log("secret derived before the restart -> close code", old.closeCode, "identified:", old.identified);
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 30000 });
  log("extension reconnected by itself to the restarted OBS");
  const sc = (await hb.call("GetCurrentProgramScene")).responseData.currentProgramSceneName;
  for (const i of (await hb.call("GetInputList")).responseData.inputs) await hb.call("SetInputMute", { inputName: i.inputName, inputMuted: true });
  const kept = (await hb.call("GetInputList")).responseData.inputs.some((i) => i.inputName === SOURCE);
  log("source kept in the scene collection:", kept);
  if (!kept) {
    await hb.call("CreateInput", { sceneName: sc, inputName: SOURCE, inputKind: "browser_source",
      inputSettings: { is_local_file: true, local_file: overlay, width: 800, height: 200, reroute_audio: true, shutdown: false, restart_when_active: false } });
    await hb.call("SetInputMute", { inputName: SOURCE, inputMuted: true });
  }
  await sleep(7000);
  await shot(hb, "obs-7-apres-redemarrage.png");
  hb.close();
  writeFileSync(join(OUT, "obs-stdout.log"), obsLog.join(""));
  const pageErrors = obsLog.join("").split("\n").filter((l) => l.includes("[obs-browser: '" + SOURCE + "']"));
  log("overlay console messages in OBS:", pageErrors.length ? "\n" + pageErrors.join("\n") : "none");
  log("done");
} finally {
  await ctx?.close().catch(() => undefined);
  site?.close();
  await stopObs();
  if (profile) rmSync(profile, { recursive: true, force: true });
}
