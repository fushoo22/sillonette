// Overlay: a local file loaded by an OBS browser source ("Local file"), no network of its own.
// It listens to the obs-browser event sent by the extension through obs-websocket.
// "#demo=1" shows fictitious tracks when the file is opened in a browser (preview, and the live
// preview of the options page, which changes the fragment as the settings change).
import { langFromNavigator, parseFragment, type Theme } from "../shared/config.ts";
import { EVENT_NAME, parseOverlayEvent } from "../shared/event.ts";
import { ErrorBadge, getBadgeEls } from "./badge.ts";
import { startDemo } from "./demo.ts";
import { getEls, Overlay } from "./render.ts";
import { applyTheme } from "./theme.ts";

/** No event for this long (the extension resends every 5 s): the browser or the tab is gone, hide. */
export const STALE_MS = 20_000;

function boot(): void {
  const lang = langFromNavigator(navigator);
  let frag = parseFragment(location.hash, lang);
  const els = getEls(document);
  const badgeEls = getBadgeEls(document);
  let theme: Theme = frag.theme;
  let themeKey = JSON.stringify(theme);
  let badge: ErrorBadge;
  let code: "" | "E10" = "";
  const setTheme = (t: Theme): Promise<void> => {
    const loaded = applyTheme(document, els.root, t);
    if (badgeEls) badgeEls.root.dataset.align = t.al;
    // error codes: setting "er" (sent with the events), or "er=0" in a preview fragment
    badge = new ErrorBadge(badgeEls, t.lg, frag.er && t.er === 1);
    badge.set(code);
    if (frag.demo) badge.setFixed(frag.err);
    return loaded;
  };
  const firstLoad = setTheme(theme);
  const overlay = new Overlay(els, theme, Date.now);
  // The long-title scrolling is measured with the fonts present at that moment: measure again when a
  // skin or a font finishes loading, or when the source is resized.
  const remeasure = () => overlay.refreshMarquee();
  void firstLoad.then(remeasure);
  document.fonts?.addEventListener?.("loadingdone", remeasure);
  window.addEventListener("resize", remeasure);
  if (frag.demo) {
    // Longer than the "a few seconds" window, so that the preview shows the card going away.
    const period = (t: Theme) => Math.max(9000, (t.nt + 5) * 1000);
    let stop = startDemo((ev) => overlay.handle(ev), period(theme));
    window.addEventListener("hashchange", () => {
      frag = parseFragment(location.hash, lang);
      const key = JSON.stringify(frag.theme);
      if (key === themeKey) {
        void setTheme(theme);
        return;
      }
      const nt = theme.nt;
      theme = frag.theme;
      themeKey = key;
      overlay.setTheme(theme);
      void setTheme(theme).then(remeasure);
      if (theme.nt !== nt) {
        stop();
        stop = startDemo((ev) => overlay.handle(ev), period(theme));
      }
    });
    return;
  }

  let stale: ReturnType<typeof setTimeout> | undefined;
  const goIdle = () => {
    overlay.handle({ v: 1, state: "idle", now: Date.now() });
    code = "";
    badge.set("");
  };
  window.addEventListener(EVENT_NAME, (e) => {
    const ev = parseOverlayEvent((e as CustomEvent).detail, lang);
    if (!ev) return;
    const key = JSON.stringify(ev.theme);
    if (key !== themeKey) {
      theme = ev.theme;
      themeKey = key;
      overlay.setTheme(theme);
      void setTheme(theme).then(remeasure);
    }
    overlay.handle(ev.np);
    code = ev.err;
    badge.set(code);
    clearTimeout(stale);
    stale = setTimeout(goIdle, STALE_MS);
  });
}

boot();
