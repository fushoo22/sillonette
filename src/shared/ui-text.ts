// Texts of the extension's pages (popup and options page), French and English. The HTML holds the
// French text; elements marked data-i18n="key" (textContent), data-i18n-label (aria-label) or
// data-i18n-title (title) are filled from here. Plain text only, never HTML. OBS labels are the real
// ones of OBS 33 (obs-websocket and obs-browser fr-FR.ini / en-US.ini).
import { api } from "./api.ts";
import type { ObsState } from "../background/obsws.ts";

export type UiLang = "fr" | "en";

const FR = {
  // common
  uiLang: "Langue de l'interface",
  // popup
  conflict: "E10 : un autre onglet YouTube Music joue déjà, celui-ci attend son tour.",
  port: "Port WebSocket d'OBS",
  password: "Mot de passe WebSocket d'OBS",
  pwWhere: "Dans OBS : « Afficher les informations de connexion », puis le bouton « Copier » à droite du mot de passe (pas les points affichés).",
  remember: "Le garder après la fermeture du navigateur",
  rememberHint: "Décoché : il reste en mémoire seulement, à recoller à chaque ouverture du navigateur.",
  save: "Enregistrer et connecter",
  forget: "Oublier le mot de passe",
  pwWarn1: "Ce mot de passe ouvre tout OBS",
  pwWarn2: ", clé de stream comprise. Sillonette ne s'en sert que pour envoyer le morceau, mais OBS ne permet pas de limiter ce qu'il autorise. Ne le montre jamais à l'écran.",
  skin: "Skin",
  layout: "Disposition",
  lyH: "Horizontale",
  lyC: "Compacte",
  lyV: "Carte verticale",
  customize: "Personnaliser…",
  customizeHint: "Couleurs, police, taille, contenu, animations, affichage quelques secondes à chaque morceau… avec un aperçu.",
  footer: "Version bêta. Connexion uniquement à OBS sur ce PC (127.0.0.1). Le mot de passe reste dans ce navigateur, non chiffré (comme dans OBS lui-même).",
  sizeHint: "Taille conseillée de la source OBS : {w} × {h}",
  pwSaved: "Un mot de passe est enregistré sur ce PC. Laisse vide pour le garder.",
  pwKept: "Un mot de passe est en mémoire jusqu'à la fermeture du navigateur. Laisse vide pour le garder.",
  pwNone: "Aucun mot de passe enregistré.",
  pwShort: "Attention : mot de passe court. OBS ne limite pas les essais, un appareil du réseau peut le deviner : garde plutôt celui généré par OBS.",
  pwMasked: "Tu as collé les points qui masquent le mot de passe, pas le mot de passe. Dans OBS, utilise le bouton « Copier ». Rien n'a été modifié.",
  portRange: "1 à 65535",
  st_off: "Pas de port configuré.",
  st_connecting: "Connexion à OBS…",
  st_ok: "Connecté à OBS.",
  st_open: "Connecté, mais OBS n'exige AUCUN mot de passe : tout appareil du réseau peut le piloter. Dans OBS : Outils → Paramètres du serveur WebSocket → « Utiliser l'authentification ».",
  st_needpass: "OBS demande son mot de passe WebSocket : colle-le ci-dessous.",
  st_auth: "Mot de passe refusé par OBS : recopie-le (OBS → Outils → Paramètres du serveur WebSocket → Afficher les informations de connexion).",
  st_kicked: "OBS a fermé la connexion de l'extension (bouton « Expulser » ?). Nouvel essai dans une minute.",
  st_rpc: "Serveur WebSocket d'OBS incompatible : il faut OBS 28 ou plus récent.",
  st_unreachable: "OBS introuvable : OBS est-il ouvert, avec le serveur WebSocket activé (Outils → Paramètres du serveur WebSocket) ?",
  st_noplugin: "Cet OBS n'a pas le plugin « Navigateur » (obs-browser).",
  st_error: "Erreur de connexion à OBS.",
  // options page
  optTitle: "Sillonette · personnaliser l'overlay",
  optH1: "Personnaliser l'overlay",
  optIntro: "Chaque réglage est enregistré tout de suite dans ce navigateur. Si Sillonette est connecté à OBS, l'overlay change dans OBS en quelques secondes. L'aperçu montre de faux morceaux, ou ta musique en direct.",
  preview: "Aperçu",
  scene: "Fond de l'aperçu",
  sceneDark: "Sombre",
  sceneLight: "Clair",
  frameTitle: "Aperçu de l'overlay",
  previewMode: "Contenu de l'aperçu",
  modeDemo: "Démo (faux morceaux)",
  modeLive: "En direct (ta musique)",
  liveOn: "En direct : le morceau que Sillonette envoie à OBS, affiché ici seulement (rien de plus n'est envoyé). La pochette vient de Google, comme dans OBS.",
  liveIdle: "Aucune musique ne joue sur YouTube Music : lance un morceau pour le voir ici.",
  size: "Taille conseillée de la source OBS :",
  updateHint: "Après une mise à jour de Sillonette, remplace aussi le dossier « overlay » utilisé par OBS : un ancien overlay ignore les nouveaux réglages.",
  gAppearance: "Apparence",
  lyCLong: "Compacte (une ligne)",
  accent: "Couleur d'accent",
  text: "Couleur du texte",
  background: "Couleur du fond",
  opacity: "Opacité du fond",
  radius: "Arrondi des coins",
  unused: "(non utilisé par ce skin)",
  artShape: "Forme de la pochette",
  asSquare: "Carrée",
  asRounded: "Arrondie",
  asRound: "Ronde",
  shadow: "Ombre",
  sd0: "Aucune",
  sd1: "Légère",
  sd2: "Forte",
  gText: "Texte",
  font: "Police du titre",
  scale: "Taille",
  marquee: "Faire défiler les titres trop longs",
  gContent: "Contenu affiché",
  showArt: "Pochette",
  showArtist: "Artiste",
  showAlbum: "Album",
  showProg: "Barre de progression",
  showTime: "Temps écoulé et durée",
  showMascot: "Mascotte",
  gAnim: "Animation",
  entrance: "Apparition",
  change: "Changement de morceau",
  tcAuto: "Comme l'apparition",
  anFade: "Fondu",
  anSlide: "Glissement",
  anPop: "Pop",
  anNone: "Aucune",
  reduced: "Réduire les mouvements (aucune animation)",
  gBehaviour: "Comportement",
  visWhen: "Quand montrer la carte",
  visAlways: "Tout le temps",
  visBrief: "Quelques secondes à chaque nouveau morceau",
  briefSecs: "Durée d'affichage (secondes, de 3 à 60)",
  briefHint: "La carte réapparaît au morceau suivant, pas quand tu relances après une pause. Un code d'erreur reste toujours visible.",
  paused: "En pause",
  paShow: "Afficher « En pause »",
  paDim: "Griser",
  paHide: "Masquer",
  pauseDelay: "Masquer après (secondes)",
  idle: "Sans musique",
  idHide: "Masquer",
  idWait: "Afficher « Sillonette en attente »",
  align: "Alignement",
  alL: "À gauche",
  alR: "À droite",
  overlayLang: "Langue de l'overlay",
  errors: "Afficher les codes d'erreur (E10) sur l'overlay",
  reset: "Rétablir les réglages du skin",
  cssSummary: "Aller plus loin : le « CSS personnalisé » d'OBS",
  cssText1: "Pour un réglage absent de cette page (titre en majuscules, contour du texte…), ouvre les propriétés de la source Navigateur dans OBS et écris des règles dans « CSS personnalisé », sous la ligne déjà présente. Exemple :",
  cssText2: "Le mode d'emploi (LISEZMOI.txt) donne d'autres exemples. Ces règles restent dans OBS : Sillonette ne les voit pas.",
  contrastOk: "Contraste du texte : {r}:1 (suffisant).",
  contrastLow: "Contraste insuffisant : {r}:1 (minimum conseillé 4,5:1). Le texte risque d'être difficile à lire à l'antenne.",
  contrastScene: "Le fond est transparent : la lisibilité dépend de ta scène.",
  saved: "Réglages enregistrés dans ce navigateur.",
  resetDone: "Réglages du skin rétablis et enregistrés.",
  saveFailed: "Enregistrement impossible : recharge la page et réessaie.",
};

export type UiKey = keyof typeof FR;

const EN: Record<UiKey, string> = {
  uiLang: "Interface language",
  conflict: "E10: another YouTube Music tab is already playing, this one waits for its turn.",
  port: "OBS WebSocket port",
  password: "OBS WebSocket password",
  pwWhere: "In OBS: \"Show Connect Info\", then the \"Copy\" button to the right of the password (not the dots shown).",
  remember: "Keep it after the browser closes",
  rememberHint: "Unticked: it stays in memory only, to paste again each time the browser opens.",
  save: "Save and connect",
  forget: "Forget the password",
  pwWarn1: "This password opens all of OBS",
  pwWarn2: ", stream key included. Sillonette only uses it to send the track, but OBS cannot limit what it allows. Never show it on screen.",
  skin: "Skin",
  layout: "Layout",
  lyH: "Horizontal",
  lyC: "Compact",
  lyV: "Vertical card",
  customize: "Customize…",
  customizeHint: "Colours, font, size, content, animations, show for a few seconds at each track… with a preview.",
  footer: "Beta version. Connects only to OBS on this PC (127.0.0.1). The password stays in this browser, not encrypted (as in OBS itself).",
  sizeHint: "Recommended size of the OBS source: {w} × {h}",
  pwSaved: "A password is saved on this PC. Leave empty to keep it.",
  pwKept: "A password is in memory until the browser closes. Leave empty to keep it.",
  pwNone: "No password saved.",
  pwShort: "Warning: short password. OBS does not limit attempts, a device on the network can guess it: better keep the one OBS generated.",
  pwMasked: "You pasted the dots that hide the password, not the password. In OBS, use the \"Copy\" button. Nothing was changed.",
  portRange: "1 to 65535",
  st_off: "No port set.",
  st_connecting: "Connecting to OBS…",
  st_ok: "Connected to OBS.",
  st_open: "Connected, but OBS asks for NO password: any device on the network can control it. In OBS: Tools → WebSocket Server Settings → \"Enable Authentication\".",
  st_needpass: "OBS asks for its WebSocket password: paste it below.",
  st_auth: "Password refused by OBS: copy it again (OBS → Tools → WebSocket Server Settings → Show Connect Info).",
  st_kicked: "OBS closed the extension's connection (\"Kick\" button?). Trying again in a minute.",
  st_rpc: "Incompatible OBS WebSocket server: OBS 28 or newer is needed.",
  st_unreachable: "OBS not found: is OBS open, with the WebSocket server enabled (Tools → WebSocket Server Settings)?",
  st_noplugin: "This OBS does not have the \"Browser\" plugin (obs-browser).",
  st_error: "Connection error with OBS.",
  optTitle: "Sillonette · customize the overlay",
  optH1: "Customize the overlay",
  optIntro: "Every setting is saved at once in this browser. If Sillonette is connected to OBS, the overlay changes in OBS within a few seconds. The preview shows made-up tracks, or your music live.",
  preview: "Preview",
  scene: "Preview background",
  sceneDark: "Dark",
  sceneLight: "Light",
  frameTitle: "Preview of the overlay",
  previewMode: "Preview content",
  modeDemo: "Demo (made-up tracks)",
  modeLive: "Live (your music)",
  liveOn: "Live: the track Sillonette sends to OBS, shown here only (nothing more is sent). The cover comes from Google, as in OBS.",
  liveIdle: "No music is playing on YouTube Music: play a track to see it here.",
  size: "Recommended size of the OBS source:",
  updateHint: "After updating Sillonette, also replace the \"overlay\" folder used by OBS: an old overlay ignores the new settings.",
  gAppearance: "Appearance",
  lyCLong: "Compact (one line)",
  accent: "Accent colour",
  text: "Text colour",
  background: "Background colour",
  opacity: "Background opacity",
  radius: "Corner radius",
  unused: "(not used by this skin)",
  artShape: "Cover shape",
  asSquare: "Square",
  asRounded: "Rounded",
  asRound: "Round",
  shadow: "Shadow",
  sd0: "None",
  sd1: "Light",
  sd2: "Strong",
  gText: "Text",
  font: "Title font",
  scale: "Size",
  marquee: "Scroll titles that are too long",
  gContent: "What is shown",
  showArt: "Cover",
  showArtist: "Artist",
  showAlbum: "Album",
  showProg: "Progress bar",
  showTime: "Elapsed time and duration",
  showMascot: "Mascot",
  gAnim: "Animation",
  entrance: "Entrance",
  change: "Track change",
  tcAuto: "Same as the entrance",
  anFade: "Fade",
  anSlide: "Slide",
  anPop: "Pop",
  anNone: "None",
  reduced: "Reduce motion (no animation)",
  gBehaviour: "Behaviour",
  visWhen: "When to show the card",
  visAlways: "All the time",
  visBrief: "A few seconds at each new track",
  briefSecs: "Display time (seconds, 3 to 60)",
  briefHint: "The card comes back with the next track, not when you resume after a pause. An error code always stays visible.",
  paused: "When paused",
  paShow: "Show \"Paused\"",
  paDim: "Dim",
  paHide: "Hide",
  pauseDelay: "Hide after (seconds)",
  idle: "No music",
  idHide: "Hide",
  idWait: "Show \"Sillonette is waiting\"",
  align: "Alignment",
  alL: "Left",
  alR: "Right",
  overlayLang: "Overlay language",
  errors: "Show error codes (E10) on the overlay",
  reset: "Reset the skin's settings",
  cssSummary: "Going further: OBS \"Custom CSS\"",
  cssText1: "For a setting this page does not have (uppercase title, text outline…), open the Browser source's properties in OBS and write rules in \"Custom CSS\", below the line already there. Example:",
  cssText2: "The guide (LISEZMOI.txt, README-EN.txt) gives more examples. These rules stay in OBS: Sillonette does not see them.",
  contrastOk: "Text contrast: {r}:1 (enough).",
  contrastLow: "Contrast too low: {r}:1 (4.5:1 recommended). The text may be hard to read on stream.",
  contrastScene: "The background is transparent: readability depends on your scene.",
  saved: "Settings saved in this browser.",
  resetDone: "The skin's settings are back and saved.",
  saveFailed: "Could not save: reload the page and try again.",
};

export const UI: Record<UiLang, Record<UiKey, string>> = { fr: FR, en: EN };

export const SKIN_NAMES: Record<UiLang, Record<string, string>> = {
  fr: { studio: "Studio", neon: "Néon", vinyle: "Vinyle", retro: "Rétro", arcade: "Arcade", lofi: "Lofi" },
  en: { studio: "Studio", neon: "Neon", vinyle: "Vinyl", retro: "Retro", arcade: "Arcade", lofi: "Lofi" },
};

export function isUiKey(k: string | undefined): k is UiKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(FR, k);
}

export function tr(lang: UiLang, key: UiKey, vars: Record<string, string | number> = {}): string {
  return UI[lang][key].replace(/\{(\w+)\}/g, (m, v: string) => (v in vars ? String(vars[v]) : m));
}

export function statusKey(s: ObsState): UiKey {
  return ("st_" + s) as UiKey;
}

/** Default: the browser's language (French if it is French, English otherwise). */
export function browserUiLang(): UiLang {
  return api.i18n.getUILanguage().toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** The language chosen with the FR/EN buttons (storage.local "uiLang"), else the browser's. Never the
 *  overlay's language: that one is the "lg" setting of the overlay, chosen separately. */
export async function loadUiLang(): Promise<UiLang> {
  const v = (await api.storage.local.get("uiLang")).uiLang;
  return v === "fr" || v === "en" ? v : browserUiLang();
}

export function saveUiLang(lang: UiLang): Promise<void> {
  return api.storage.local.set({ uiLang: lang });
}

/** Fills the marked elements of a page and its FR/EN buttons (aria-pressed). */
export function translatePage(doc: Document, lang: UiLang): void {
  doc.documentElement.lang = lang;
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n]")) if (isUiKey(el.dataset.i18n)) el.textContent = tr(lang, el.dataset.i18n);
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n-label]")) if (isUiKey(el.dataset.i18nLabel)) el.setAttribute("aria-label", tr(lang, el.dataset.i18nLabel));
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n-title]")) if (isUiKey(el.dataset.i18nTitle)) el.title = tr(lang, el.dataset.i18nTitle);
  for (const b of doc.querySelectorAll<HTMLButtonElement>("button[data-ui-lang]")) b.setAttribute("aria-pressed", String(b.dataset.uiLang === lang));
}
