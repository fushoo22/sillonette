// Popup: OBS WebSocket port + password, connection state, skin and layout.
// Settings are written to storage.local (the password to storage.session instead when it must not
// outlive the browser); the background reacts to the change. The saved password is never put back
// into the page (the field stays empty: typing a new one replaces it).
import { api } from "../shared/api.ts";
import { SKINS, normalizeTheme, sourceSize, withSkin, type Layout, type Theme } from "../shared/config.ts";
import { DEFAULT_PORT, validPort, type ObsState } from "../background/obsws.ts";
import { browserUiLang, loadUiLang, saveUiLang, SKIN_NAMES, statusKey, tr, translatePage, type UiKey, type UiLang } from "../shared/ui-text.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const port = $<HTMLInputElement>("port");
const password = $<HTMLInputElement>("password");
const remember = $<HTMLInputElement>("remember");
const session = api.storage.session ?? null;
/** obs-websocket does not limit attempts (no lockout in its sources): a short password can be guessed
 *  by any device of the network. The one OBS generates has 16 letters and digits. */
const SHORT_PASSWORD = 12;
let shortWarning = false;
const skin = $<HTMLSelectElement>("skin");
const layout = $<HTMLSelectElement>("layout");

const LEVEL: Record<ObsState, string> = {
  off: "idle", connecting: "warn", ok: "ok", open: "warn", needpass: "error", auth: "error",
  kicked: "error", rpc: "error", unreachable: "error", noplugin: "error", error: "error",
};
let lang: UiLang = "fr";
let lastStatus: unknown;
let lastTheme: Theme | null = null;
const t = (k: UiKey, v?: Record<string, string | number>) => tr(lang, k, v);
function fillSkins(): void {
  const v = skin.value;
  skin.replaceChildren(...Object.keys(SKINS).map((id) => new Option(SKIN_NAMES[lang][id] ?? id, id)));
  if (v) skin.value = v;
}

function renderStatus(st: unknown): void {
  lastStatus = st;
  const s = (st ?? {}) as { obs?: ObsState; conflicts?: number };
  const state: ObsState = s.obs && s.obs in LEVEL ? s.obs : s.obs ? "error" : "connecting";
  const level = LEVEL[state], text = t(statusKey(state));
  $("dot").className = "dot " + level;
  $("dot").setAttribute("aria-label", text);
  $("status").textContent = text;
  $("conflict").hidden = !((s.conflicts ?? 0) > 0);
}

/** Fallback language of the overlay (setting "lg" not chosen yet): the browser's, as in the background. */
const uiLang = browserUiLang();

function renderSize(th: Theme): void {
  lastTheme = th;
  const { w, h } = sourceSize(th);
  $("size").textContent = t("sizeHint", { w, h });
}

async function load(): Promise<void> {
  const s = await api.storage.local.get(["obsPort", "obsPassword", "theme"]);
  const inSession = session ? (await session.get("obsPassword")).obsPassword : undefined;
  const saved = typeof s.obsPassword === "string" && s.obsPassword !== "";
  const kept = typeof inSession === "string" && inSession !== "";
  port.value = String(validPort(s.obsPort) ? s.obsPort : DEFAULT_PORT);
  remember.checked = !kept || saved;
  const hint = $("pwHint");
  hint.textContent = t(saved ? "pwSaved" : kept ? "pwKept" : "pwNone");
  if (shortWarning) hint.textContent += " " + t("pwShort");
  hint.classList.toggle("warn", shortWarning);
  $<HTMLButtonElement>("forget").disabled = !saved && !kept;
  const th = normalizeTheme(s.theme, uiLang);
  skin.value = th.sk;
  layout.value = th.ly;
  renderSize(th);
  renderStatus((await (session ?? api.storage.local).get("obsStatus")).obsStatus);
}

$<HTMLFormElement>("obs").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = Number(port.value);
  if (!validPort(p)) {
    port.setCustomValidity(t("portRange"));
    port.reportValidity();
    return;
  }
  port.setCustomValidity("");
  // spaces around a pasted password are a copy mistake: OBS's own "copy" button gives none
  let pw = password.value.trim();
  // only mask characters: the hidden field was copied, not the password. Keep what is saved.
  const masked = /^[•●∙·⬤*]+$/.test(pw);
  $("pwError").hidden = !masked;
  if (masked) {
    $("pwError").textContent = t("pwMasked");
    password.value = "";
    return;
  }
  if (pw === "") {
    // no new password typed: keep the saved one, moved if the "remember" box changed
    const l = (await api.storage.local.get("obsPassword")).obsPassword;
    const t = session ? (await session.get("obsPassword")).obsPassword : undefined;
    pw = typeof l === "string" && l !== "" ? l : typeof t === "string" ? t : "";
  } else shortWarning = pw.length < SHORT_PASSWORD;
  // session missing (very old browser): the password can only be remembered
  const keep = remember.checked || !session;
  // one write per area, in an order where the background never connects with a stale password
  if (pw !== "" && keep) {
    await session?.remove("obsPassword");
    await api.storage.local.set({ obsPort: p, obsPassword: pw });
  } else {
    await api.storage.local.set({ obsPort: p });
    if (pw !== "") {
      await api.storage.local.remove("obsPassword");
      await session!.set({ obsPassword: pw });
    }
  }
  password.value = "";
  await load();
  api.runtime.sendMessage({ type: "sillonette-reconnect" }).catch(() => undefined);
});

// Forget: the password leaves both storage areas; the background disconnects and, as OBS still asks
// for one, waits without sending anything ("needpass").
$("forget").addEventListener("click", async () => {
  await api.storage.local.remove("obsPassword");
  await session?.remove("obsPassword");
  shortWarning = false;
  password.value = "";
  await load();
});

/** Skin or layout changed here: the other settings of the options page are kept (another skin brings
 *  its own colours, fonts and shapes, as on the options page). */
async function saveTheme(): Promise<void> {
  const cur = normalizeTheme((await api.storage.local.get("theme")).theme, uiLang);
  const theme = { ...(skin.value === cur.sk ? cur : withSkin(cur, skin.value)), ly: layout.value as Layout };
  await api.storage.local.set({ theme: normalizeTheme(theme, uiLang) });
  renderSize(theme);
}
skin.addEventListener("change", () => void saveTheme());
layout.addEventListener("change", () => void saveTheme());
$("customize").addEventListener("click", () => {
  void api.runtime.openOptionsPage().then(() => window.close(), () => undefined);
});

api.storage.onChanged.addListener((changes) => {
  if (changes.obsStatus) renderStatus(changes.obsStatus.newValue);
});

/** Interface language (FR/EN buttons, remembered); the overlay's own language is not touched. */
function applyLang(l: UiLang): void {
  lang = l;
  translatePage(document, lang);
  fillSkins();
  if (lastTheme) renderSize(lastTheme);
  renderStatus(lastStatus);
  if (!$("pwError").hidden) $("pwError").textContent = t("pwMasked");
}
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-ui-lang]")) {
  b.addEventListener("click", () => {
    const l: UiLang = b.dataset.uiLang === "en" ? "en" : "fr";
    applyLang(l);
    void saveUiLang(l).then(load);
  });
}

void loadUiLang().then((l) => {
  applyLang(l);
  return load();
});
