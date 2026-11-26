// Build: dist/{chrome,firefox,overlay}.
//   SILLONETTE_E2E_MATCH   test builds only: extra content-script match (http://127.0.0.1/*)
//   SILLONETTE_OUT         output directory (default dist)
import { build, transform } from "esbuild";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ART_HOSTS } from "../src/shared/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const e2eMatch = process.env.SILLONETTE_E2E_MATCH || "";
const outRoot = process.env.SILLONETTE_OUT || join(root, "dist");
if (e2eMatch && !/^http:\/\/(127\.0\.0\.1|localhost)\/\*$/.test(e2eMatch)) throw new Error("SILLONETTE_E2E_MATCH must be http://127.0.0.1/*");

/** Firefox add-on id (never change it once published: it is the add-on's identity). */
export const GECKO_ID = "sillonette@fushoo.fr";

// Extension pages (service worker / event page, popup) may only open WebSockets to 127.0.0.1.
// Firefox MV3 adds "upgrade-insecure-requests" to its default CSP (ws:// would become wss://):
// an explicit CSP replaces that default.
const CSP = "script-src 'self'; object-src 'self'; connect-src ws://127.0.0.1:*; default-src 'self'";

function manifest(target) {
  const m = {
    manifest_version: 3,
    name: "Sillonette",
    short_name: "Sillonette",
    description: "Affiche dans OBS le morceau joué sur YouTube Music, sans serveur (WebSocket d'OBS sur ce PC). En développement.",
    version,
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    permissions: ["storage"],
    content_scripts: [{ matches: ["https://music.youtube.com/*", ...(e2eMatch ? [e2eMatch] : [])], js: ["content.js"], run_at: "document_idle", all_frames: false }],
    action: { default_title: "Sillonette", default_popup: "popup.html", default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" } },
    content_security_policy: { extension_pages: CSP },
  };
  if (target === "chrome") {
    m.background = { service_worker: "background.js" };
    m.minimum_chrome_version = "116"; // WebSocket traffic keeps the service worker alive from 116 on
  } else {
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = {
      gecko: { id: GECKO_ID, strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } },
      gecko_android: { strict_min_version: "142.0" }, // data_collection_permissions exists from 142 on Android
    };
  }
  return m;
}

const common = { bundle: true, minify: false, format: "iife", target: ["chrome116", "firefox140"], legalComments: "none", logLevel: "warning" };

for (const target of ["chrome", "firefox"]) {
  const out = join(outRoot, target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build({ ...common, entryPoints: { background: join(src, "background/background.ts"), content: join(src, "content/main.ts"), popup: join(src, "popup/popup.ts") }, outdir: out });
  cpSync(join(src, "popup/popup.html"), join(out, "popup.html"));
  cpSync(join(src, "popup/popup.css"), join(out, "popup.css"));
  cpSync(join(root, "icons"), join(out, "icons"), { recursive: true });
  cpSync(join(root, "LICENSE"), join(out, "LICENSE"));
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest(target), null, 2) + "\n");
}

// Overlay: one folder, opened as a local file. Chromium refuses @font-face over file:// (CORS, origin
// "null"), so the fonts are inlined as data: URLs; scripts, stylesheets and images load fine.
const o = join(outRoot, "overlay");
rmSync(o, { recursive: true, force: true });
mkdirSync(join(o, "skins"), { recursive: true });
const TARGET = ["chrome103", "firefox128"];
await build({ entryPoints: [join(src, "overlay/overlay.ts")], outfile: join(o, "overlay.js"), bundle: true, minify: true, format: "iife", target: TARGET, legalComments: "none", logLevel: "warning" });
const css = readFileSync(join(src, "overlay/overlay.css"), "utf8").replace(/url\(fonts\/([a-z0-9-]+\.woff2)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${readFileSync(join(src, "fonts", f)).toString("base64")})`);
if (/url\(fonts\//.test(css)) throw new Error("a font was not inlined");
writeFileSync(join(o, "overlay.css"), (await transform(css, { loader: "css", minify: true, target: TARGET })).code);
for (const f of readdirSync(join(src, "skins"))) {
  if (f.endsWith(".css")) await build({ entryPoints: [join(src, "skins", f)], outfile: join(o, "skins", f), minify: true, target: TARGET, logLevel: "warning" });
  else if (f.endsWith(".svg")) cpSync(join(src, "skins", f), join(o, "skins", f));
}
// Artwork hosts: the same list the extension and the overlay check (src/shared/types.ts).
const ART = DEFAULT_ART_HOSTS.map((h) => "https://" + h);
// style-src 'unsafe-inline': OBS injects the source's "Custom CSS" as an inline <style> (obs-browser
// browser-client.cpp); with 'self' only, OBS 33 logged a CSP error and the custom CSS was ignored.
const csp = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src data:; img-src 'self' data: ${ART.join(" ")}; connect-src 'none'; base-uri 'none'; form-action 'none'`;
const html = readFileSync(join(src, "overlay/index.html"), "utf8").replace("<title>", `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<title>`);
if (!html.includes("Content-Security-Policy")) throw new Error("overlay index.html changed: update scripts/build.mjs");
writeFileSync(join(o, "sillonette-overlay.html"), html);
cpSync(join(src, "overlay/demo"), join(o, "demo"), { recursive: true });
mkdirSync(join(o, "licences"), { recursive: true });
for (const f of readdirSync(join(src, "fonts")).filter((f) => f.endsWith(".txt"))) cpSync(join(src, "fonts", f), join(o, "licences", f));
cpSync(join(root, "LICENSE"), join(o, "licences", "LICENSE-Sillonette.txt"));
console.log(`Sillonette ${version} built in ${outRoot} (chrome, firefox, overlay)${e2eMatch ? " [E2E]" : ""}`);
