// Manual trial of the personalisation (0.2.0) with a REAL OBS (not part of npm run e2e).
// Same isolation as essai.mjs: throw-away OBS configuration (HOME and XDG_CONFIG_HOME in WORK),
// obs-websocket on 127.0.0.1:PORT with a random test password, every audio input muted, no stream, no
// recording. A muted headless Chromium runs the extension (test build) and the fake YouTube Music page;
// the settings are changed on the real options page. Proof: GetSourceScreenshot of the source, measured
// by a small canvas program (visible pixels, colour counts, bounding box) instead of looking at images.
//   node test/obs-reel/perso.mjs WORK OUT        (needs a display for OBS: WAYLAND_DISPLAY or DISPLAY)
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildForTests, CHROMIUM, ROOT, isolate, sleep, FRENCH_ENV } from "../e2e/lib.mjs";
import { normalizeTheme, sourceSize } from "../../src/shared/config.ts";

const [WORK, OUT] = process.argv.slice(2);
if (!WORK || !OUT) throw new Error("usage: perso.mjs WORK OUT");
const PORT = 14456;
const PASSWORD = randomBytes(12).toString("base64url"); // test-only, never reused, never printed
const SOURCE = "Sillonette perso";
mkdirSync(OUT, { recursive: true });
const results = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); log(ok ? "OK  " : "ÉCHEC", name, detail); };

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

const sha = (s) => createHash("sha256").update(s).digest("base64");
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
  throw new Error("OBS websocket never answered");
}

let h, ctx, site, profile, probe, dist, overlay, size = { w: 800, h: 200 };
async function shot(name) {
  const r = await h.call("GetSourceScreenshot", { sourceName: SOURCE, imageFormat: "png", imageWidth: size.w, imageHeight: size.h });
  if (!r.requestStatus.result) throw new Error("screenshot: " + JSON.stringify(r.requestStatus));
  const data = r.responseData.imageData;
  if (name) writeFileSync(join(OUT, name), Buffer.from(data.split(",")[1], "base64"));
  return data;
}
/** Visible pixels (alpha > 24), pixels close to a colour, and the bounding box of what is visible. */
function measure(dataUrl, rgb = null) {
  return probe.evaluate(([src, c]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let vis = 0, col = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] <= 24) continue;
        vis++;
        const p = i / 4, x = p % img.width, y = Math.floor(p / img.width);
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        if (c === "red" ? d[i] > 150 && d[i] - d[i + 1] > 90 && d[i] - d[i + 2] > 60
          : c && Math.abs(d[i] - c[0]) < 40 && Math.abs(d[i + 1] - c[1]) < 40 && Math.abs(d[i + 2] - c[2]) < 40) col++;
      }
      resolve({ w: img.width, h: img.height, vis, col, box: vis ? [x0, y0, x1, y1] : null });
    };
    img.src = src;
  }), [dataUrl, rgb]);
}
async function setSource(t) {
  size = sourceSize(normalizeTheme(t));
  await h.call("SetInputSettings", { inputName: SOURCE, inputSettings: { width: size.w, height: size.h } });
}

startObs();
try {
  h = await connectHarness();
  const ver = await h.call("GetVersion");
  log("OBS", ver.responseData.obsVersion, "obs-websocket", ver.responseData.obsWebSocketVersion);
  const scene = (await h.call("GetCurrentProgramScene")).responseData.currentProgramSceneName;
  for (const i of (await h.call("GetInputList")).responseData.inputs) await h.call("SetInputMute", { inputName: i.inputName, inputMuted: true });
  dist = buildForTests(join(ROOT, "dist/e2e-perso"));
  overlay = join(dist, "overlay/sillonette-overlay.html");
  const created = await h.call("CreateInput", {
    sceneName: scene, inputName: SOURCE, inputKind: "browser_source",
    inputSettings: { is_local_file: true, local_file: overlay, width: 800, height: 200, reroute_audio: true, shutdown: false, restart_when_active: false },
  });
  check("source Navigateur créée (fichier local)", created.requestStatus.result);
  await h.call("SetInputMute", { inputName: SOURCE, inputMuted: true });
  const status = async () => {
    const s = (await h.call("GetStreamStatus")).responseData.outputActive, r = (await h.call("GetRecordStatus")).responseData.outputActive;
    return !s && !r;
  };

  const html = readFileSync(join(ROOT, "test/e2e/fake-ytmusic.html"));
  site = createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); });
  await new Promise((r) => site.listen(0, "127.0.0.1", r));
  profile = mkdtempSync(join(WORK, "chromium-"));
  const dir = join(dist, "chrome");
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM, headless: true, locale: "fr-FR", env: FRENCH_ENV, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  await isolate(ctx);
  probe = await ctx.newPage();
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.fill("#port", String(PORT));
  await popup.fill("#password", PASSWORD);
  await popup.click("#save");
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 15000 });
  log("extension connected to the real OBS");
  const yt = await ctx.newPage();
  await yt.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt.evaluate(() => { setTrack("Essai personnalisation", "Sillonette"); return play(); });
  await sleep(3000);
  const base = await measure(await shot("obs-perso-1-studio.png"), [0xa3, 0x21, 0x6b]);
  check("lecture affichée (skin Studio par défaut)", base.vis > 5000, JSON.stringify(base));

  // 1. live settings from the real options page
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForFunction(() => document.getElementById("frame").getAttribute("src") !== null);
  let t0 = Date.now();
  await opt.fill("#ac", "#00c853");
  let green = { col: 0 };
  while (Date.now() - t0 < 8000 && green.col < 50) { await sleep(250); green = await measure(await shot(), [0x00, 0xc8, 0x53]); }
  check("couleur d'accent changée sur la page d'options → appliquée dans OBS", green.col >= 50, `${Date.now() - t0} ms, ${green.col} px verts`);
  await shot("obs-perso-2-accent-vert.png");
  await opt.selectOption("#sk", "neon");
  await opt.check('input[name="ly"][value="v"]');
  await opt.fill("#sc", "120");
  const neon = normalizeTheme({ sk: "neon", ly: "v", sc: 120 });
  await setSource(neon);
  await sleep(6000);
  const nv = await measure(await shot("obs-perso-3-neon-v-120.png"), [0xff, 0x4f, 0xd8]);
  check("skin Néon, carte verticale, 120 % : appliqués en direct", nv.col > 100 && nv.box && nv.box[3] - nv.box[1] > nv.box[2] - nv.box[0], JSON.stringify(nv));
  await opt.uncheck("#er");
  await opt.selectOption("#lg", "en");
  await opt.click("#reset");
  await sleep(500);
  await opt.selectOption("#sk", "studio");
  await setSource({});

  // 2. "a few seconds at each new track"
  await opt.check('input[name="vis"][value="brief"]');
  await opt.fill("#nt", "4");
  await opt.locator("#nt").blur();
  await sleep(5500); // the setting reached OBS (switching it on shows the current track for 4 s from then)
  await sleep(4500);
  let m = await measure(await shot());
  check("mode 4 s : carte cachée une fois le délai passé", m.vis < 50, JSON.stringify(m));
  t0 = Date.now();
  await yt.evaluate(() => setTrack("Nouveau morceau", "Sillonette"));
  m = await measure(await shot("obs-perso-4-nouveau-morceau.png"));
  for (let i = 0; i < 10 && m.vis < 5000; i++) { await sleep(200); m = await measure(await shot("obs-perso-4-nouveau-morceau.png")); }
  check("mode 4 s : nouveau morceau affiché", m.vis > 5000, `${Date.now() - t0} ms`);
  await sleep(1500);
  check("mode 4 s : toujours visible à 2 s (renvoi de 5 s ignoré)", (await measure(await shot())).vis > 5000);
  await sleep(4000);
  m = await measure(await shot("obs-perso-5-cache-apres-4s.png"));
  check("mode 4 s : caché après 4 s", m.vis < 50, JSON.stringify(m));
  await yt.evaluate(() => pause());
  await sleep(1500);
  await yt.evaluate(() => play());
  await sleep(6000);
  m = await measure(await shot());
  check("mode 4 s : pas de réapparition à la reprise après une pause", m.vis < 50, JSON.stringify(m));
  await opt.check("#er");
  const yt2 = await ctx.newPage();
  await yt2.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt2.evaluate(() => { setTrack("Second onglet", "Autre"); return play(); });
  await sleep(3000);
  m = await measure(await shot("obs-perso-6-E10-carte-cachee.png"));
  check("mode 4 s : badge E10 visible alors que la carte est cachée", m.vis > 300 && m.vis < base.vis / 2, JSON.stringify(m));
  await yt2.close();
  await sleep(1500);

  // 3. reconnection: source reloaded, OBS restarted: the settings come back with the events
  await opt.check('input[name="vis"][value="always"]');
  await opt.fill("#ac", "#00c853");
  await sleep(3000);
  await h.call("PressInputPropertiesButton", { inputName: SOURCE, propertyName: "refreshnocache" });
  await sleep(7000);
  m = await measure(await shot("obs-perso-7-source-rechargee.png"), [0x00, 0xc8, 0x53]);
  check("source rechargée : réglages revenus en ≤ 7 s", m.col >= 50, JSON.stringify(m));
  check("aucun live ni enregistrement", await status());
  h.close();
  writeFileSync(join(OUT, "obs-perso-stdout-1.log"), obsLog.join(""));
  await stopObs();
  obsLog.length = 0;
  startObs();
  h = await connectHarness();
  for (const i of (await h.call("GetInputList")).responseData.inputs) await h.call("SetInputMute", { inputName: i.inputName, inputMuted: true });
  await popup.waitForFunction(() => document.getElementById("status").textContent === "Connecté à OBS.", null, { timeout: 30000 });
  await sleep(7000);
  m = await measure(await shot("obs-perso-8-apres-redemarrage.png"), [0x00, 0xc8, 0x53]);
  check("OBS redémarré : reconnexion seule, réglages réappliqués", m.col >= 50, JSON.stringify(m));

  // 4. combinations at the recommended size: nothing cut (the visible box stays inside the source),
  //    long title and E10 badge shown (worst case)
  await yt.evaluate(() => setTrack("Un titre vraiment très long pour vérifier que rien ne déborde de la source", "Artiste au nom assez long aussi"));
  const yt3 = await ctx.newPage();
  await yt3.goto(`http://127.0.0.1:${site.address().port}/watch`);
  await yt3.evaluate(() => { setTrack("Autre onglet", "E10"); return play(); });
  const combos = [
    { sk: "studio", ly: "h", sc: 100 }, { sk: "neon", ly: "v", sc: 150 }, { sk: "arcade", ly: "c", sc: 200 },
    { sk: "lofi", ly: "h", sc: 50 }, { sk: "vinyle", ly: "v", sc: 100, al: "r" }, { sk: "retro", ly: "c", sc: 120, al: "r" },
    { sk: "studio", ly: "h", sc: 175, sh: ["art", "artist", "album", "prog", "time"], ft: "hand" },
  ];
  for (const c of combos) {
    await sw.evaluate((th) => chrome.storage.local.set({ theme: th }), c);
    await setSource(c);
    await sleep(6500);
    const name = `obs-perso-9-${c.sk}-${c.ly}-${c.sc}${c.al ? "-" + c.al : ""}.png`;
    m = await measure(await shot(name));
    const inside = m.box && m.box[0] > 0 && m.box[1] > 0 && m.box[2] < m.w - 1 && m.box[3] < m.h - 1;
    check(`sans débordement : ${c.sk} / ${c.ly} / ${c.sc} %${c.al === "r" ? " / à droite" : ""} (${size.w} × ${size.h})`, inside && m.vis > 2000, JSON.stringify(m.box));
  }
  await yt3.close();

  // 5. OBS "Custom CSS" (documented in LISEZMOI): applied, no CSP error
  await sw.evaluate(() => chrome.storage.local.set({ theme: { sk: "studio" } }));
  await setSource({});
  await sleep(6000);
  const before = await shot();
  const css = "body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }\n.sillonette .title { text-transform: uppercase; }\n.sillonette .title, .sillonette .line2 { text-shadow: 0 0 3px #ff0000, 0 0 3px #ff0000; }";
  await h.call("SetInputSettings", { inputName: SOURCE, inputSettings: { css } });
  await sleep(6000);
  const red0 = (await measure(before, "red")).col;
  m = await measure(await shot("obs-perso-10-css-personnalise.png"), "red");
  check("CSS personnalisé d'OBS (majuscules + contour rouge) appliqué", m.col > red0 + 300, `${red0} -> ${m.col} px rouges`);
  check("aucun live ni enregistrement", await status());
  h.close();
  const all = obsLog.join("");
  writeFileSync(join(OUT, "obs-perso-stdout.log"), all);
  const csp = all.split("\n").filter((l) => /Content Security Policy|Refused to/.test(l));
  check("aucune erreur CSP dans le journal d'OBS", csp.length === 0, csp.slice(0, 2).join(" | "));
} catch (e) {
  check("déroulé du script", false, String(e).slice(0, 300));
} finally {
  await ctx?.close().catch(() => undefined);
  site?.close();
  await stopObs();
  if (profile) rmSync(profile, { recursive: true, force: true });
  writeFileSync(join(OUT, "resultats.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`${results.length - bad.length}/${results.length} OK`);
  process.exitCode = bad.length ? 1 : 0;
}
