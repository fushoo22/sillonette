// Overlay: a local file loaded by an OBS browser source ("Local file"), no network of its own.
// It listens to the obs-browser event sent by the extension through obs-websocket.
// "#demo=1" shows fictitious tracks when the file is opened in a browser (preview).
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
  const frag = parseFragment(location.hash, lang);
  const els = getEls(document);
  const badgeEls = getBadgeEls(document);
  let theme: Theme = frag.theme;
  let themeKey = JSON.stringify(theme);
  let badge: ErrorBadge;
  const setTheme = (t: Theme): Promise<void> => {
    const loaded = applyTheme(document, els.root, t);
    if (badgeEls) badgeEls.root.dataset.align = t.al;
    badge = new ErrorBadge(badgeEls, t.lg, frag.er);
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
    startDemo((ev) => overlay.handle(ev));
    badge!.setFixed(frag.err);
    return;
  }

  let stale: ReturnType<typeof setTimeout> | undefined;
  const goIdle = () => {
    overlay.handle({ v: 1, state: "idle", now: Date.now() });
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
    badge.set(ev.err);
    clearTimeout(stale);
    stale = setTimeout(goIdle, STALE_MS);
  });
}

boot();
