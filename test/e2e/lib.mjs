// Shared helpers for the end-to-end tests (headless, muted Chromium). No network access outside
// 127.0.0.1: artwork CDNs are answered locally, every other request is aborted.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT = join(ROOT, "test/e2e/out");
mkdirSync(OUT, { recursive: true });

/** Test build (content script also on http://127.0.0.1/*, for the fake YouTube Music page). */
export function buildForTests(out) {
  execFileSync(process.execPath, [join(ROOT, "scripts/build.mjs")], { env: { ...process.env, SILLONETTE_E2E_MATCH: "http://127.0.0.1/*", SILLONETTE_OUT: out }, stdio: "inherit" });
  return out;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chromium from Playwright's cache (npx playwright-core install chromium), or SILLONETTE_CHROMIUM. */
export const CHROMIUM = process.env.SILLONETTE_CHROMIUM || join(homedir(), ".cache/ms-playwright/chromium-1255/chrome-linux64/chrome");

/** Serves a local image for any artwork CDN request and blocks every other non-local request. */
export async function isolate(context) {
  const art = readFileSync(join(ROOT, "src/overlay/demo/art-2.svg"));
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1" || u.protocol === "chrome-extension:") return route.continue();
    if (["lh3.googleusercontent.com", "i.ytimg.com", "yt3.ggpht.com"].includes(u.hostname) || u.hostname.endsWith(".ggpht.com") || u.hostname.endsWith(".googleusercontent.com"))
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: art });
    return route.abort();
  });
}

/** Browser language of the extension (chrome.i18n.getUILanguage follows the environment on Linux, not
 *  the "locale" option): French tests pin French, so that they pass on English machines too. */
export const FRENCH_ENV = { ...process.env, LANG: "fr_FR.UTF-8", LANGUAGE: "fr_FR", LC_ALL: "fr_FR.UTF-8" };
