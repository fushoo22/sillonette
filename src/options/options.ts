// Options page: every overlay setting, with a live preview. Plain form; every change goes through the
// shared decoder (normalizeTheme), is saved at once in storage.local ("theme", as the popup does) and
// the background sends it to OBS with the next event. The preview is the overlay itself, copied into
// the extension (apercu/), in demo mode: the settings travel in its URL fragment, nothing else.
import { api } from "../shared/api.ts";
import {
  BRIEF_DEFAULT, BRIEF_MAX, BRIEF_MIN, encodeTheme, FONTS, normalizeTheme, skinDefaults, skinInfo, SKINS, sourceSize,
  withSkin, type Lang, type Theme,
} from "../shared/config.ts";
import { themeContrast } from "../shared/contrast.ts";
import { EVENT_NAME } from "../shared/event.ts";
import { buildEvent } from "../background/build-event.ts";
import { browserUiLang, loadUiLang, saveUiLang, SKIN_NAMES, tr, translatePage, type UiKey, type UiLang } from "../shared/ui-text.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const frame = $<HTMLIFrameElement>("frame");
const stage = $("stage");

export const FONT_NAMES: Record<string, string> = {
  mochiy: "Mochiy Pop One", nunito: "Nunito", inter: "Inter", serif: "Fraunces", grotesk: "Space Grotesk",
  pixel: "Pixelify Sans", mono: "Space Mono", hand: "Caveat",
};
const PARTS = ["art", "artist", "album", "prog", "time", "mascot"] as const;
/** Overlay language when none is chosen yet: the browser's, as in the background. */
const fallbackLang: Lang = browserUiLang();
/** Language of this page (FR/EN buttons, remembered): never changes the overlay's own "lg". */
let lang: UiLang = fallbackLang;
const t = (k: UiKey, v?: Record<string, string | number>) => tr(lang, k, v);

let theme: Theme = normalizeTheme({}, fallbackLang);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function field<T extends HTMLElement>(name: string): T {
  return form.elements.namedItem(name) as unknown as T;
}
function setRadio(name: string, value: string): void {
  for (const r of form.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${name}"]`)) r.checked = r.value === value;
}
function radio(name: string): string {
  return document.querySelector<HTMLInputElement>(`input[type=radio][name="${name}"]:checked`)?.value ?? "";
}

/** Theme -> form controls. */
function writeForm(t: Theme): void {
  for (const k of ["sk", "ac", "tx", "bg", "ft", "as", "an", "tc", "pa", "id", "lg"] as const) field<HTMLInputElement>(k).value = String(t[k]);
  for (const k of ["ba", "rd", "sc", "pt", "sd"] as const) field<HTMLInputElement>(k).value = String(t[k]);
  setRadio("ly", t.ly);
  setRadio("al", t.al);
  setRadio("vis", t.nt > 0 ? "brief" : "always");
  $<HTMLInputElement>("nt").value = String(t.nt > 0 ? t.nt : BRIEF_DEFAULT);
  $<HTMLInputElement>("mq").checked = t.mq === 1;
  $<HTMLInputElement>("rm").checked = t.rm === 1;
  $<HTMLInputElement>("er").checked = t.er === 1;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="sh"]')) box.checked = t.sh.includes(box.value as Theme["sh"][number]);
}

/** A typed duration out of range is brought back into it (never switches the mode off by surprise). */
function briefSeconds(): number {
  const n = Math.round(Number($<HTMLInputElement>("nt").value));
  return Number.isFinite(n) && n > 0 ? Math.min(BRIEF_MAX, Math.max(BRIEF_MIN, n)) : BRIEF_DEFAULT;
}

/** Form controls -> settings, validated by the shared decoder (invalid value = the skin's). */
function readForm(): Theme {
  const num = (k: string) => Number(field<HTMLInputElement>(k).value);
  const raw: Record<string, unknown> = {
    v: 1, sk: field<HTMLSelectElement>("sk").value, ly: radio("ly"),
    ac: field<HTMLInputElement>("ac").value, tx: field<HTMLInputElement>("tx").value, bg: field<HTMLInputElement>("bg").value,
    ba: num("ba"), ft: field<HTMLSelectElement>("ft").value, sc: num("sc"), rd: num("rd"),
    sh: PARTS.filter((p) => form.querySelector<HTMLInputElement>(`input[name="sh"][value="${p}"]`)?.checked),
    an: field<HTMLSelectElement>("an").value, tc: field<HTMLSelectElement>("tc").value,
    mq: $<HTMLInputElement>("mq").checked ? 1 : 0, pa: field<HTMLSelectElement>("pa").value, pt: num("pt"),
    id: field<HTMLSelectElement>("id").value, al: radio("al"), rm: $<HTMLInputElement>("rm").checked ? 1 : 0,
    lg: field<HTMLSelectElement>("lg").value, as: field<HTMLSelectElement>("as").value, sd: num("sd"),
    nt: radio("vis") === "brief" ? briefSeconds() : 0, er: $<HTMLInputElement>("er").checked ? 1 : 0,
  };
  return normalizeTheme(raw, theme.lg);
}

/** Everything that depends on the settings, except saving. */
function render(): void {
  const skin = skinInfo(theme.sk);
  for (const k of ["rd", "as"] as const) {
    const control = field<HTMLInputElement>(k);
    const ignored = skin.ignores.includes(k);
    control.disabled = ignored;
    const note = control.closest(".field")?.querySelector<HTMLElement>(".unused");
    if (note) note.hidden = !ignored;
  }
  $("mascotRow").hidden = !skin.defaults.sh.includes("mascot");
  field<HTMLInputElement>("pt").disabled = theme.pa !== "hide";
  $<HTMLInputElement>("nt").disabled = theme.nt === 0;
  $("baOut").textContent = theme.ba + " %";
  $("rdOut").textContent = theme.rd + " px";
  $("scOut").textContent = theme.sc + " %";
  const size = sourceSize(theme);
  $("size").textContent = size.w + " × " + size.h + " px";
  const c = themeContrast(theme);
  const r = (Math.floor(c.min * 10) / 10).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB");
  const el = $("contrast");
  el.textContent = t(c.ok ? "contrastOk" : "contrastLow", { r }) + (theme.ba < 50 ? " " + t("contrastScene") : "");
  el.classList.toggle("low", !c.ok);
  fitPreview();
  preview();
}

function fitPreview(): void {
  const size = sourceSize(theme);
  const k = Math.min(1, (stage.clientWidth - 2) / size.w);
  frame.style.width = size.w + "px";
  frame.style.height = size.h + "px";
  frame.style.transform = "scale(" + k.toFixed(4) + ")";
  stage.style.height = Math.ceil(size.h * k) + "px";
}

/** Preview content: "demo" (made-up tracks) or "live" (what the extension sends to OBS right now). */
let mode: "demo" | "live" = "demo";
let liveTimer: ReturnType<typeof setInterval> | undefined;
/** Same storage area as the background's state shared between tabs. */
const session = api.storage.session ?? api.storage.local;

/** Demo: the settings travel in the fragment, a change only replaces it (applied without reloading).
 *  Live: another address (the overlay then takes its settings from the events), fed by liveEvent(). */
function preview(): void {
  const base = mode === "live" ? "apercu/apercu.html?direct" : "apercu/apercu.html";
  const src = base + "#" + (mode === "demo" ? "demo=1&" : "") + "s=" + encodeTheme(theme);
  const current = frame.getAttribute("src");
  if (current === null || current.split("#")[0] !== base) frame.setAttribute("src", src);
  else if (mode === "demo") frame.contentWindow?.location.replace(new URL(src, location.href).href);
  else void liveEvent();
}

/** Live preview: the very event the background sends to OBS (same tab state, E10 included, same
 *  settings), handed to the preview frame only. Nothing is sent anywhere; works without OBS. */
async function liveEvent(): Promise<void> {
  if (mode !== "live") return;
  const { ev } = buildEvent((await session.get("lease")).lease, theme, Date.now());
  const w = frame.contentWindow as (Window & typeof globalThis) | null;
  if (mode !== "live" || !w || w.location.search !== "?direct") return;
  w.dispatchEvent(new w.CustomEvent(EVENT_NAME, { detail: JSON.parse(JSON.stringify(ev)) }));
  $("liveHint").textContent = t(ev.np.state === "idle" ? "liveIdle" : "liveOn");
}

function setMode(m: "demo" | "live"): void {
  mode = m;
  clearInterval(liveTimer);
  $("liveHint").textContent = "";
  if (m === "live") liveTimer = setInterval(() => void liveEvent(), 2000);
  preview();
}

/** Last settings written by this page: the storage event they cause is not a change made elsewhere. */
let written = "";

function save(now: boolean, done: UiKey = "saved"): void {
  clearTimeout(saveTimer);
  const go = () => {
    written = JSON.stringify(theme);
    void api.storage.local.set({ theme }).then(
      () => { $("saved").textContent = t(done); },
      () => { $("saved").textContent = t("saveFailed"); },
    );
  };
  if (now) go();
  else saveTimer = setTimeout(go, 200); // a slider being dragged: one write at the end
}

function onChange(ev: Event): void {
  const target = ev.target as HTMLInputElement;
  if (target.name === "scene") {
    stage.className = "stage " + radio("scene");
    return;
  }
  if (target.name === "mode") {
    if (ev.type === "change") setMode(radio("mode") === "live" ? "live" : "demo");
    return;
  }
  if (target.id === "sk") {
    // Another skin: its own colours, font and shapes; layout, size, content and behaviour stay.
    theme = withSkin(theme, target.value);
    writeForm(theme);
  } else {
    theme = readForm();
    // a typed number brought back into its range is shown once the field is left
    if (ev.type === "change" && (target.type === "number" || target.name === "vis")) writeForm(theme);
  }
  render();
  save(ev.type === "change");
}

/** The form has been filled from the saved settings at least once. */
let loaded = false;

async function load(): Promise<void> {
  const s = await api.storage.local.get("theme");
  const t = normalizeTheme(s.theme, fallbackLang);
  if (loaded && JSON.stringify(t) === JSON.stringify(theme)) return;
  loaded = true;
  theme = t;
  writeForm(theme);
  render();
}

function setLang(l: UiLang): void {
  lang = l;
  translatePage(document, lang);
  document.title = t("optTitle");
  const sk = $<HTMLSelectElement>("sk");
  sk.replaceChildren(...Object.keys(SKINS).map((id) => new Option(SKIN_NAMES[lang][id] ?? id, id)));
  sk.value = theme.sk;
  $("saved").textContent = "";
  if (loaded) render(); // before the first load, load() renders
  if (mode === "live") void liveEvent();
}

function boot(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-ui-lang]")) {
    b.addEventListener("click", () => {
      const l: UiLang = b.dataset.uiLang === "en" ? "en" : "fr";
      setLang(l);
      void saveUiLang(l);
    });
  }
  $<HTMLSelectElement>("ft").append(...Object.keys(FONTS).map((id) => new Option(FONT_NAMES[id] ?? id, id)));
  form.addEventListener("input", onChange);
  form.addEventListener("change", onChange);
  for (const el of document.querySelectorAll<HTMLInputElement>('input[name="scene"], input[name="mode"]')) el.addEventListener("change", onChange);
  frame.addEventListener("load", () => void liveEvent()); // live: first event as soon as the overlay is there
  form.addEventListener("submit", (e) => e.preventDefault());
  $("reset").addEventListener("click", () => {
    theme = skinDefaults(theme.sk, theme.lg);
    writeForm(theme);
    render();
    save(true, "resetDone");
  });
  window.addEventListener("resize", fitPreview);
  // changed elsewhere (the popup's skin or layout): follow
  api.storage.onChanged.addListener((changes, area) => {
    if ((area === "session" || area === "local") && changes.lease) void liveEvent(); // a tab reported something
    if (area !== "local") return;
    const ul = changes.uiLang?.newValue;
    if ((ul === "fr" || ul === "en") && ul !== lang) setLang(ul); // chosen in the popup
    if (!changes.theme) return;
    if (JSON.stringify(normalizeTheme(changes.theme.newValue, fallbackLang)) === written) return;
    void load();
  });
  void loadUiLang().then((l) => {
    setLang(l);
    return load();
  });
}

boot();
