// Lint of the built extension (both targets) and overlay: minimal permissions, only ws://127.0.0.1,
// referenced files present, no remote code, no eval, no inline script, strict overlay CSP.
//   node scripts/check-manifest.mjs [dist]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.argv[2] || join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const errors = [];
const fail = (m) => errors.push(m);

import { DEFAULT_ART_HOSTS } from "../src/shared/types.ts";
const ART = DEFAULT_ART_HOSTS.map((h) => "https://" + h).join(" ");
// connect-src: only OBS on this PC; img-src: the covers' hosts (options page live preview), nothing else.
const CSP = `script-src 'self'; object-src 'self'; connect-src ws://127.0.0.1:*; img-src 'self' ${ART}; default-src 'self'`;
const ALLOWED_URLS = ["https://music.youtube.com", "https://lh3.googleusercontent.com", "https://i.ytimg.com", "https://yt3.ggpht.com"];

for (const target of ["chrome", "firefox"]) {
  const dir = join(dist, target);
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const p = (msg) => fail(`${target}: ${msg}`);
  if (m.manifest_version !== 3) p("manifest_version must be 3");
  if (m.version !== pkg.version) p(`version ${m.version} != package.json ${pkg.version}`);
  if (m.name !== "Sillonette") p("name must be Sillonette");
  if (m.default_locale !== "fr" || m.description !== "__MSG_extDescription__") p("description from _locales, default_locale fr");
  for (const l of ["fr", "en"]) {
    const msg = existsSync(join(dir, "_locales", l, "messages.json")) ? JSON.parse(readFileSync(join(dir, "_locales", l, "messages.json"), "utf8")) : {};
    const d = msg.extDescription?.message;
    if (typeof d !== "string" || d.length < 10 || d.length > 132 || Object.keys(msg).join() !== "extDescription") p(`_locales/${l}: extDescription (10-132 characters) only`);
  }
  if (JSON.stringify(m.permissions) !== '["storage"]') p(`permissions must be exactly ["storage"]: ${JSON.stringify(m.permissions)}`);
  if (m.host_permissions || m.optional_permissions || m.optional_host_permissions) p("no host or optional permissions");
  if (m.key) p("no fixed key: the extension must never take the id of another one");
  const cs = m.content_scripts ?? [];
  if (cs.length !== 1 || JSON.stringify(cs[0].matches) !== '["https://music.youtube.com/*"]' || cs[0].all_frames) p("content script must only match https://music.youtube.com/* (top frame)");
  if (m.content_security_policy?.extension_pages !== CSP) p("extension CSP must only allow ws://127.0.0.1 (and images from the covers' hosts)");
  if (m.externally_connectable || m.web_accessible_resources) p("no externally_connectable / web_accessible_resources");
  if (target === "chrome") {
    if (m.background?.service_worker !== "background.js" || m.background.scripts) p("chrome needs background.service_worker only");
  } else {
    if (JSON.stringify(m.background?.scripts) !== '["background.js"]' || m.background.service_worker) p("firefox needs background.scripts only");
    const g = m.browser_specific_settings?.gecko;
    if (g?.id !== "sillonette@fushoo.fr" || !g.strict_min_version) p("firefox needs gecko.id sillonette@fushoo.fr and strict_min_version");
    if (JSON.stringify(g?.data_collection_permissions?.required) !== '["none"]') p("firefox: data_collection_permissions.required = [none] (nothing leaves the PC)");
  }
  if (JSON.stringify(m.options_ui) !== '{"page":"options.html","open_in_tab":true}') p("options_ui must be options.html, open in a tab");
  // preview copy of the overlay (options page): demo only, nothing outside the extension
  const ap = readFileSync(join(dir, "apercu/apercu.html"), "utf8");
  const apCsp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(ap)?.[1] ?? "";
  if (apCsp !== `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' ${ART}; connect-src 'none'; base-uri 'none'; form-action 'none'`) p("apercu: strict CSP (extension files and the covers' hosts only)");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(ap) || /\son\w+=/i.test(ap) || /\sstyle=/i.test(ap)) p("apercu: inline script/handler/style");
  if (/data:font/.test(readFileSync(join(dir, "apercu/overlay.css"), "utf8"))) p("apercu: fonts must be files (the extension CSP refuses data: fonts)");
  if (readFileSync(join(dir, "apercu/overlay.js"), "utf8") !== readFileSync(join(dist, "overlay/overlay.js"), "utf8")) p("apercu: overlay.js must be the overlay's own script");
  const files = [m.options_ui?.page, m.background?.service_worker, ...(m.background?.scripts ?? []), ...cs.flatMap((c) => c.js), m.action?.default_popup, ...Object.values(m.icons ?? {}), ...Object.values(m.action?.default_icon ?? {})].filter(Boolean);
  for (const f of files) if (!existsSync(join(dir, f))) p(`missing file ${f}`);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const js = readFileSync(join(dir, f), "utf8");
    if (/\beval\s*\(|new\s+Function\s*\(/.test(js)) p(`${f}: eval/new Function`);
    if (/import\s*\(\s*["'`]http/.test(js) || /importScripts\s*\(/.test(js)) p(`${f}: remote code loading`);
    if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|EventSource/.test(js)) p(`${f}: network API other than the obs-websocket client`);
    const urls = (js.match(/(?:https?|wss?):\/\/[a-z0-9.-]+/gi) ?? []).filter((u) => !ALLOWED_URLS.includes(u) && u !== "ws://127.0.0.1");
    if (urls.length) p(`${f}: unexpected URLs ${[...new Set(urls)].join(", ")}`);
  }
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(join(dir, f), "utf8");
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /\son\w+=/i.test(html) || /\sstyle=/i.test(html)) p(`${f}: inline script/handler/style`);
  }
}

const ov = join(dist, "overlay");
const html = readFileSync(join(ov, "sillonette-overlay.html"), "utf8");
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
if (!csp.includes("default-src 'none'") || !csp.includes("connect-src 'none'") || !csp.includes("script-src 'self'")) fail("overlay: CSP must be default-src 'none', script-src 'self', connect-src 'none'");
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /\son\w+=/i.test(html)) fail("overlay: inline script/handler");
const ojs = readFileSync(join(ov, "overlay.js"), "utf8");
if (/\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(ojs)) fail("overlay.js: eval or network API");
for (const f of ["overlay.css", "overlay.js", "licences/LICENSE-Sillonette.txt"]) if (!existsSync(join(ov, f))) fail(`overlay: missing ${f}`);

if (errors.length) {
  console.error("Lint FAILED:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Lint OK (chrome + firefox manifests, permissions, CSP, no remote code, overlay)");
