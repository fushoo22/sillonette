// The overlay alone (file://, headless Chromium), events dispatched the way obs-browser does:
// long-title scrolling (direction, measured again after a skin or a resize) and artwork changes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { buildForTests, CHROMIUM, ROOT, OUT, sleep } from "./lib.mjs";

let browser, dist;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const LTR = "Une chanson au titre vraiment très très long, avec des mots en plus pour déborder largement de la carte";
const RTL = "أغنية طويلة جدا جدا عن البحر والقمر والنجوم في ليلة صيفية دافئة على الشاطئ";
const art = (name) => `https://lh3.googleusercontent.com/${name}=w544-h544`;
const event = (theme, np) => ({ v: 1, theme: b64({ v: 1, lg: "fr", ...theme }), err: "",
  np: { v: 1, state: "playing", artist: "Artiste", album: "Album", art: "", dur: 200_000, pos: 1000, rate: 1, at: Date.now(), now: Date.now(), ...np } });

before(async () => {
  dist = buildForTests(join(ROOT, "dist/e2e-overlay"));
  browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ["--mute-audio"] });
});
after(async () => browser?.close());

async function open(width = 800, height = 200, delayArt = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR" });
  const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${c}"/></svg>`;
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === "file:") return route.continue();
    if (u.hostname !== "lh3.googleusercontent.com") return route.abort();
    const name = u.pathname.slice(1).split("=")[0];
    if (delayArt[name]) await sleep(delayArt[name]);
    if (name === "absente") return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg(name === "rouge" ? "#f00" : "#00f") });
  });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(join(dist, "overlay/sillonette-overlay.html")).href);
  return p;
}
const send = (p, ev) => p.evaluate((d) => window.dispatchEvent(new CustomEvent("sillonette", { detail: d })), ev);
/** The scroll distance set by the overlay, and the real overflow of the title measured now. */
const marquee = (p) => p.evaluate(() => {
  const t = document.querySelector(".title");
  const on = t.classList.contains("marquee");
  t.classList.remove("marquee");
  const overflow = t.scrollWidth - t.clientWidth;
  if (on) t.classList.add("marquee");
  return { on, dist: parseFloat(t.style.getPropertyValue("--_mq-dist")) || 0, overflow, dir: getComputedStyle(t).direction };
});
const waitMarquee = (p) => p.waitForFunction(() => document.querySelector(".title").classList.contains("marquee"), null, { timeout: 5000 });

test("long title: scrolls the right way, left-to-right and right-to-left", async () => {
  const p = await open();
  await send(p, event({ sk: "studio" }, { title: LTR }));
  await waitMarquee(p);
  const l = await marquee(p);
  assert.equal(l.dir, "ltr");
  assert.ok(l.dist < 0 && Math.abs(-l.dist - l.overflow) <= 2, "LTR: towards the left by the overflow " + JSON.stringify(l));
  await send(p, event({ sk: "studio" }, { title: RTL }));
  await waitMarquee(p);
  await sleep(300);
  const r = await marquee(p);
  assert.equal(r.dir, "rtl", "dir=auto: an Arabic title is right-to-left");
  assert.ok(r.dist > 0 && Math.abs(r.dist - r.overflow) <= 2, "RTL: towards the right by the overflow " + JSON.stringify(r));
  await p.context().close();
});

test("long title: measured again after another skin, layout or source size", async () => {
  const p = await open();
  await send(p, event({ sk: "studio" }, { title: LTR }));
  await waitMarquee(p);
  const a = await marquee(p);
  // same track, other skin (other font and padding) and then other layout: the distance follows
  for (const theme of [{ sk: "arcade" }, { sk: "arcade", ly: "c" }]) {
    await send(p, event(theme, { title: LTR }));
    await p.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("o-loading"), null, { timeout: 5000 });
    await sleep(500);
    const b = await marquee(p);
    assert.ok(b.on && Math.abs(-b.dist - b.overflow) <= 2, JSON.stringify({ theme, before: a, after: b }));
  }
  await p.setViewportSize({ width: 400, height: 200 });
  await sleep(500);
  const c = await marquee(p);
  assert.ok(c.on && Math.abs(-c.dist - c.overflow) <= 2, "after a resize " + JSON.stringify(c));
  await p.context().close();
});

test("new track: the previous artwork never shows with the new title", async () => {
  const p = await open(800, 200, { lent: 1500 });
  await send(p, event({ sk: "studio" }, { title: "Premier", art: art("rouge") }));
  await p.waitForFunction(() => document.querySelector(".art img").complete && !document.querySelector(".sillonette").classList.contains("no-art"), null, { timeout: 5000 });
  const shown = () => p.evaluate(() => getComputedStyle(document.querySelector(".art img")).visibility === "visible" && getComputedStyle(document.querySelector(".art img")).display !== "none");
  assert.equal(await shown(), true);
  await send(p, event({ sk: "studio" }, { title: "Second", art: art("lent") }));
  await sleep(300);
  assert.equal(await p.textContent(".title > span"), "Second");
  assert.equal(await shown(), false, "old artwork hidden while the new one loads");
  await p.screenshot({ path: join(OUT, "overlay-pochette-en-chargement.png") });
  await p.waitForFunction(() => !document.querySelector(".sillonette").classList.contains("art-loading"), null, { timeout: 5000 });
  assert.equal(await shown(), true, "new artwork shown once loaded");
  // a missing artwork: placeholder, no stuck hidden state
  await send(p, event({ sk: "studio" }, { title: "Troisième", art: art("absente") }));
  await p.waitForFunction(() => document.querySelector(".sillonette").classList.contains("no-art") && !document.querySelector(".sillonette").classList.contains("art-loading"), null, { timeout: 5000 });
  await send(p, event({ sk: "studio" }, { title: "Quatrième", art: "" }));
  await sleep(200);
  assert.equal(await p.evaluate(() => document.querySelector(".sillonette").className.includes("art-loading")), false);
  assert.equal(await p.evaluate(() => document.querySelector(".sillonette").classList.contains("no-art")), true);
  await p.context().close();
});

test("OBS custom CSS (an inline <style> added to the page) applies, scripts stay locked", async () => {
  const p = await open();
  const csp = [];
  await p.exposeFunction("__cspSeen", (v) => csp.push(v));
  await p.evaluate(() => document.addEventListener("securitypolicyviolation", (e) => window.__cspSeen(e.violatedDirective)));
  // what obs-browser does with the source's "Custom CSS"
  await p.evaluate(() => { const s = document.createElement("style"); s.textContent = "body { background-color: rgb(255, 0, 0); }"; document.head.appendChild(s); });
  await sleep(200);
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 0, 0)");
  await p.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__inline = 1"; document.head.appendChild(s); });
  await sleep(200);
  assert.equal(await p.evaluate(() => window.__inline), undefined, "inline script refused");
  assert.deepEqual(csp, ["script-src-elem"], "only the inline script is reported");
  await p.context().close();
});
