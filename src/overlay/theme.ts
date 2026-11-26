// Applies a validated Theme to the page through CSS custom properties (CSSOM only:
// allowed by the strict CSP, no inline style attribute, no injected CSS text).
import { FONTS, rgba, skinInfo, type Theme } from "../shared/config.ts";

const SHADOWS = ["none", "0 0.25rem 0.9rem rgba(32, 56, 86, 0.18)", "0 0.45rem 1.6rem rgba(32, 56, 86, 0.34)"];
const LOAD_TIMEOUT_MS = 2500;

/** Resolves once the skin's stylesheet and fonts are there (at once when the skin did not change). */
export function applyTheme(doc: Document, root: HTMLElement, th: Theme): Promise<void> {
  const skin = skinInfo(th.sk);
  const s = doc.documentElement.style;
  s.setProperty("--o-scale", String(th.sc / 100));
  s.setProperty("--o-accent", th.ac);
  s.setProperty("--o-text", th.tx);
  s.setProperty("--o-text-2", rgba(th.tx, 74));
  s.setProperty("--o-bg", rgba(th.bg, th.ba));
  s.setProperty("--o-bg-alpha", String(th.ba / 100));
  s.setProperty("--o-radius", th.rd / 16 + "rem");
  s.setProperty("--o-font-title", FONTS[th.ft] ?? FONTS.mochiy!);
  s.setProperty("--o-font-body", FONTS[skin.body] ?? FONTS.nunito!);
  s.setProperty("--o-art-shape", th.as === "round" ? "50%" : th.as === "square" ? "0.2rem" : "calc(var(--o-radius) * 0.7)");
  s.setProperty("--o-shadow", SHADOWS[th.sd]!);
  doc.documentElement.lang = th.lg;

  root.dataset.skin = skin.id;
  root.dataset.layout = th.ly;
  root.dataset.align = th.al;
  root.dataset.anim = th.an;
  root.dataset.swap = th.tc === "auto" ? th.an : th.tc;
  root.dataset.pause = th.pa;
  root.dataset.rm = String(th.rm);
  root.dataset.sd = String(th.sd);
  for (const part of ["art", "artist", "album", "prog", "time", "mascot"] as const) {
    root.classList.toggle("show-" + part, th.sh.includes(part));
  }
  const link = doc.getElementById("skin") as HTMLLinkElement | null;
  const href = "skins/" + skin.id + ".css"; // from the registry, never raw input
  if (link && link.getAttribute("href") !== href) {
    // Another skin: keep the card invisible until its stylesheet and fonts are there
    // (no flash of the default skin, no font swap on air). The default skin is unchanged.
    root.classList.add("o-loading");
    const css = new Promise<void>((resolve) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
    });
    link.setAttribute("href", href);
    const fonts = doc.fonts
      ? css.then(() => Promise.all([FONTS[th.ft]!, FONTS[skin.body]!].map((f) => doc.fonts.load("1em " + f).catch(() => [])))).then(() => undefined)
      : css;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS));
    return Promise.race([fonts, timeout]).then(() => root.classList.remove("o-loading"));
  }
  return Promise.resolve();
}
