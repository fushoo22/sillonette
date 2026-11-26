// Minimal Marionette client (Firefox's native automation protocol, no dependency).
// Used instead of WebDriver BiDi because BiDi refuses to open moz-extension:// pages.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort, sleep } from "./lib.mjs";

export async function launchFirefox(prefs = {}) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "sillonette-ff-"));
  const all = {
    "marionette.port": port, "media.volume_scale": "0.0", // never any sound on the test machine
    "media.autoplay.default": 0, "media.autoplay.blocking_policy": 0,
    "browser.shell.checkDefaultBrowser": false, "datareporting.policy.dataSubmissionEnabled": false,
    "toolkit.telemetry.enabled": false, "app.update.enabled": false, "browser.startup.homepage_override.mstone": "ignore",
    "network.captive-portal-service.enabled": false, "network.connectivity-service.enabled": false,
    "extensions.getAddons.cache.enabled": false, "extensions.update.enabled": false, "browser.tabs.warnOnClose": false,
    // No real network from tests: everything except 127.0.0.1 goes to a dead proxy.
    "network.proxy.type": 1, "network.proxy.http": "127.0.0.1", "network.proxy.http_port": 9,
    "network.proxy.ssl": "127.0.0.1", "network.proxy.ssl_port": 9, "network.proxy.share_proxy_settings": true,
    "network.dns.disablePrefetch": true, "network.prefetch-next": false, ...prefs,
  };
  writeFileSync(join(profile, "user.js"), Object.entries(all).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n") + "\n");
  const proc = spawn(process.env.SILLONETTE_FIREFOX || "firefox", ["--headless", "--marionette", "--no-remote", "--profile", profile, "about:blank"], { stdio: "ignore", env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" } });

  // Never leave a browser behind: a live child process keeps the test file (and the CI job) running forever.
  const kill = () => { try { proc.kill("SIGKILL"); } catch {} };
  process.once("exit", kill);
  proc.once("error", () => undefined); // missing binary: reported by the timeout below
  try {
    return await connectMarionette(port, proc, profile, kill);
  } catch (e) {
    kill();
    rmSync(profile, { recursive: true, force: true });
    throw e;
  }
}

/** Rejects after ms (a stuck browser must fail the test, not hang it). */
function within(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, reject) => { t = setTimeout(() => reject(new Error("timeout: " + what)), ms); })]).finally(() => clearTimeout(t));
}

async function connectMarionette(port, proc, profile, kill) {
  let sock;
  for (let i = 0; i < 100 && !sock && proc.exitCode === null; i++) {
    await sleep(150);
    sock = await new Promise((resolve) => {
      const s = connect(port, "127.0.0.1", () => resolve(s));
      s.on("error", () => resolve(undefined));
    });
  }
  if (!sock) throw new Error("Marionette did not start (firefox exit code " + proc.exitCode + ")");
  let buf = "", id = 0;
  const waiting = new Map();
  let hello;
  const helloP = new Promise((r) => (hello = r));
  sock.on("data", (d) => {
    buf += d.toString("utf8");
    for (;;) {
      const colon = buf.indexOf(":");
      if (colon < 0) return;
      const len = Number(buf.slice(0, colon));
      const body = Buffer.from(buf.slice(colon + 1), "utf8");
      if (body.length < len) return;
      const msg = JSON.parse(body.subarray(0, len).toString("utf8"));
      buf = body.subarray(len).toString("utf8");
      if (!Array.isArray(msg)) { hello(msg); continue; }
      const [, mid, err, res] = msg;
      const w = waiting.get(mid);
      waiting.delete(mid);
      err ? w?.reject(new Error(err.error + ": " + err.message)) : w?.resolve(res);
    }
  });
  await within(helloP, 15000, "Marionette hello");
  const send = (cmd, params = {}) => within(new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    const body = JSON.stringify([0, n, cmd, params]);
    sock.write(Buffer.byteLength(body) + ":" + body);
  }), 30000, cmd);
  await send("WebDriver:NewSession", { capabilities: {} });

  const ff = {
    send,
    /** Opens a tab with the system principal (allowed to load moz-extension:// pages), returns its handle. */
    async openTab(url) {
      const before = (await send("WebDriver:GetWindowHandles")).value ?? (await send("WebDriver:GetWindowHandles"));
      await send("Marionette:SetContext", { value: "chrome" });
      await send("WebDriver:ExecuteScript", {
        script: `const w = Services.wm.getMostRecentWindow("navigator:browser");
                 w.gBrowser.selectedTab = w.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
        args: [url],
      });
      await send("Marionette:SetContext", { value: "content" });
      for (let i = 0; i < 50; i++) {
        const now = await send("WebDriver:GetWindowHandles");
        const list = now.value ?? now;
        const fresh = list.filter((h) => !(before.value ?? before).includes(h));
        if (fresh.length) {
          await send("WebDriver:SwitchToWindow", { handle: fresh[0], focus: true });
          for (let j = 0; j < 50; j++) {
            if ((await ff.evalIn(fresh[0], "return document.readyState")) === "complete" && (await ff.evalIn(fresh[0], "return location.href")) !== "about:blank") break;
            await sleep(100);
          }
          return fresh[0];
        }
        await sleep(100);
      }
      throw new Error("tab not opened");
    },
    async evalIn(handle, script) {
      await send("WebDriver:SwitchToWindow", { handle, focus: false });
      const r = await send("WebDriver:ExecuteScript", { script, args: [] });
      return r.value ?? r;
    },
    async waitFor(handle, expr, timeout = 8000) {
      const end = Date.now() + timeout;
      for (;;) {
        try { if (await ff.evalIn(handle, "return !!(" + expr + ")")) return; } catch {}
        if (Date.now() > end) throw new Error("timeout waiting for " + expr);
        await sleep(150);
      }
    },
    async screenshot(handle) {
      await send("WebDriver:SwitchToWindow", { handle, focus: true });
      const r = await send("WebDriver:TakeScreenshot", { full: false });
      return Buffer.from(r.value ?? r, "base64");
    },
    async close() {
      try { await send("Marionette:Quit", { flags: ["eForceQuit"] }); } catch {}
      sock.destroy();
      kill();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true });
    },
  };
  return ff;
}
