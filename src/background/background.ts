// Background (service worker on Chrome/Edge/Opera, event page on Firefox).
// YouTube Music tab -> content script -> here: lease between tabs -> obs-websocket on
// 127.0.0.1 -> obs-browser emit_event -> the overlay file in an OBS browser source.
// No server, no other network access (the manifest's CSP only allows ws://127.0.0.1).
import { api } from "../shared/api.ts";
import type { TrackState } from "../content/types.ts";
import { normalizeTheme } from "../shared/config.ts";
import { EVENT_NAME } from "../shared/event.ts";
import { buildEvent } from "./build-event.ts";
import { cleanLease, emptyLease, removeTab, report, type Lease } from "./lease.ts";
import { DEFAULT_PORT, ObsLink, validPort, type ObsState } from "./obsws.ts";

/** Every RESEND_MS the current state goes out again: a browser source that was (re)loaded, or an OBS
 *  started later, is in sync within this delay. It also keeps the Chrome service worker alive
 *  (WebSocket traffic extends its lifetime) while OBS is connected. */
export const RESEND_MS = 5000;

const session = api.storage.session ?? api.storage.local;

// The content script (it runs inside the YouTube Music tab's process) never needs the extension's
// storage: keep storage.local (port, theme, remembered password) out of its reach. Default for
// storage.session already; storage.local is exposed to content scripts unless restricted here.
// Called at every start (the level is not documented as persistent). Older browsers: no-op.
type Restrictable = { setAccessLevel?: (o: { accessLevel: string }) => Promise<void> };
const storageLocked = (async () => {
  try {
    await (api.storage.local as Restrictable).setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
    return true;
  } catch {
    return false; // Firefox: see docs/TECHNIQUE.md
  }
})();
const lang = api.i18n.getUILanguage().toLowerCase().startsWith("fr") ? "fr" : "en";

async function setStatus(obs: ObsState, conflicts: number): Promise<void> {
  await session.set({ obsStatus: { obs, conflicts, at: Date.now() } });
}

let conflicts = 0;
const link = new ObsLink({
  WS: WebSocket as unknown as ConstructorParameters<typeof ObsLink>[0]["WS"],
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  random: Math.random,
  onState: (s) => void setStatus(s, conflicts),
  onReady: () => {
    void push();
    // after an OBS or browser restart: ask the tabs to read their page again
    void (async () => {
      for (const id of Object.keys(cleanLease((await session.get("lease")).lease).tabs)) {
        api.tabs?.sendMessage(Number(id), { type: "sillonette-refresh" }).catch(() => undefined);
      }
    })();
  },
});

/** The password is in storage.local ("remember", survives a browser restart) or in storage.session
 *  (memory only, gone when the browser closes). Never both: the popup moves it. */
async function settings(): Promise<{ port: number; password: string; theme: unknown }> {
  const s = await api.storage.local.get(["obsPort", "obsPassword", "theme"]);
  const t = api.storage.session ? (await api.storage.session.get("obsPassword")).obsPassword : undefined;
  const pw = typeof s.obsPassword === "string" && s.obsPassword !== "" ? s.obsPassword : typeof t === "string" ? t : "";
  return { port: validPort(s.obsPort) ? s.obsPort : DEFAULT_PORT, password: pw, theme: s.theme };
}

// Lease kept in storage.session; serialised so that two quick messages never race.
let lock: Promise<unknown> = Promise.resolve();
function withLease(fn: (l: Lease) => Lease): Promise<Lease> {
  const run = lock.then(async () => {
    const next = fn(cleanLease((await session.get("lease")).lease));
    await session.set({ lease: next });
    return next;
  });
  lock = run.catch(() => undefined);
  return run;
}

async function push(): Promise<void> {
  const now = Date.now();
  const { theme } = await settings();
  const { ev, conflicts: c } = buildEvent((await session.get("lease")).lease, normalizeTheme(theme, lang), now);
  if (c !== conflicts) {
    conflicts = c;
    await setStatus(link.current, conflicts);
  }
  link.emit(EVENT_NAME, ev);
}

const ready = (async () => {
  await storageLocked;
  const st = await session.get("lease");
  if (st.lease === undefined) await session.set({ lease: emptyLease() }); // browser (re)started
  const s = await settings();
  link.configure(s.port, s.password);
})();

setInterval(() => {
  link.poke();
  if (link.ready) void push();
}, RESEND_MS);

api.runtime.onMessage.addListener((msg, from) => {
  if (from.id !== api.runtime.id) return false;
  const m = msg as { type?: unknown; track?: unknown };
  const tab = from.tab?.id;
  // The popup's "save" button. Saving unchanged values fires no storage event, so without this a
  // refused password would only be tried again a minute later. Never accepted from a tab.
  if (m?.type === "sillonette-reconnect" && tab === undefined) {
    void (async () => {
      await ready;
      const s = await settings();
      link.configure(s.port, s.password, true);
    })();
  }
  if (m?.type === "track" && typeof tab === "number") {
    void (async () => {
      await ready;
      link.poke(); // the service worker may just have woken up
      await withLease((l) => report(l, tab, (m.track ?? null) as TrackState | null, Date.now()));
      await push();
    })();
  }
  return false;
});

// Closing a tab: release what it shows at once (the content script cannot say so).
api.tabs?.onRemoved.addListener((tabId) => {
  void (async () => {
    await ready;
    await withLease((l) => removeTab(l, tabId, Date.now()));
    await push();
  })();
});

// Popup saved new settings: reconnect if the port or password changed (or was forgotten), resend for the theme.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" && !(area === "session" && "obsPassword" in changes)) return;
  void (async () => {
    await ready;
    if ("obsPort" in changes || "obsPassword" in changes) {
      const s = await settings();
      link.configure(s.port, s.password);
    }
    if ("theme" in changes) await push();
  })();
});
