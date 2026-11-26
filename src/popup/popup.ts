// Popup: OBS WebSocket port + password, connection state, skin and layout.
// Settings are written to storage.local (the password to storage.session instead when it must not
// outlive the browser); the background reacts to the change. The saved password is never put back
// into the page (the field stays empty: typing a new one replaces it).
import { api } from "../shared/api.ts";
import { SKINS, normalizeTheme, sourceSize, withSkin, type Layout, type Theme } from "../shared/config.ts";
import { DEFAULT_PORT, validPort, type ObsState } from "../background/obsws.ts";

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

const TEXT: Record<ObsState, [string, string]> = {
  off: ["idle", "Pas de port configuré."],
  connecting: ["warn", "Connexion à OBS…"],
  ok: ["ok", "Connecté à OBS."],
  open: ["warn", "Connecté, mais OBS n'exige AUCUN mot de passe : tout appareil du réseau peut le piloter. Dans OBS : Outils → Paramètres du serveur WebSocket → « Utiliser l'authentification »."],
  needpass: ["error", "OBS demande son mot de passe WebSocket : colle-le ci-dessous."],
  auth: ["error", "Mot de passe refusé par OBS : recopie-le (OBS → Outils → Paramètres du serveur WebSocket → Afficher les informations de connexion)."],
  kicked: ["error", "OBS a fermé la connexion de l'extension (bouton « Expulser » ?). Nouvel essai dans une minute."],
  rpc: ["error", "Serveur WebSocket d'OBS incompatible : il faut OBS 28 ou plus récent."],
  unreachable: ["error", "OBS introuvable : OBS est-il ouvert, avec le serveur WebSocket activé (Outils → Paramètres du serveur WebSocket) ?"],
  noplugin: ["error", "Cet OBS n'a pas le plugin « Navigateur » (obs-browser)."],
  error: ["error", "Erreur de connexion à OBS."],
};
const SKIN_NAMES: Record<string, string> = { studio: "Studio", neon: "Néon", vinyle: "Vinyle", retro: "Rétro", arcade: "Arcade", lofi: "Lofi" };
for (const id of Object.keys(SKINS)) skin.add(new Option(SKIN_NAMES[id] ?? id, id));

function renderStatus(st: unknown): void {
  const s = (st ?? {}) as { obs?: ObsState; conflicts?: number };
  const [level, text] = TEXT[s.obs ?? "connecting"] ?? TEXT.error;
  $("dot").className = "dot " + level;
  $("dot").setAttribute("aria-label", text);
  $("status").textContent = text;
  $("conflict").hidden = !((s.conflicts ?? 0) > 0);
}

/** Same fallback language as the background. */
const uiLang = api.i18n.getUILanguage().toLowerCase().startsWith("fr") ? "fr" : "en";

function renderSize(t: Theme): void {
  const { w, h } = sourceSize(t);
  $("size").textContent = `Taille conseillée de la source OBS : ${w} × ${h}`;
}

async function load(): Promise<void> {
  const s = await api.storage.local.get(["obsPort", "obsPassword", "theme"]);
  const inSession = session ? (await session.get("obsPassword")).obsPassword : undefined;
  const saved = typeof s.obsPassword === "string" && s.obsPassword !== "";
  const kept = typeof inSession === "string" && inSession !== "";
  port.value = String(validPort(s.obsPort) ? s.obsPort : DEFAULT_PORT);
  remember.checked = !kept || saved;
  const hint = $("pwHint");
  hint.textContent = saved ? "Un mot de passe est enregistré sur ce PC. Laisse vide pour le garder."
    : kept ? "Un mot de passe est en mémoire jusqu'à la fermeture du navigateur. Laisse vide pour le garder."
    : "Aucun mot de passe enregistré.";
  if (shortWarning) hint.textContent += " Attention : mot de passe court. OBS ne limite pas les essais, un appareil du réseau peut le deviner : garde plutôt celui généré par OBS.";
  hint.classList.toggle("warn", shortWarning);
  $<HTMLButtonElement>("forget").disabled = !saved && !kept;
  const t = normalizeTheme(s.theme, uiLang);
  skin.value = t.sk;
  layout.value = t.ly;
  renderSize(t);
  renderStatus((await (session ?? api.storage.local).get("obsStatus")).obsStatus);
}

$<HTMLFormElement>("obs").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = Number(port.value);
  if (!validPort(p)) {
    port.setCustomValidity("1 à 65535");
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
    $("pwError").textContent = "Tu as collé les points qui masquent le mot de passe, pas le mot de passe. Dans OBS, utilise le bouton « Copier ». Rien n'a été modifié.";
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
  const t = normalizeTheme((await api.storage.local.get("theme")).theme, uiLang);
  const theme = { ...(skin.value === t.sk ? t : withSkin(t, skin.value)), ly: layout.value as Layout };
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

void load();
