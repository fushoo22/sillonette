// Minimal obs-websocket v5 client (protocol: obs-websocket docs/generated/protocol.md,
// checked against the obs-websocket 5.7.6 sources shipped with OBS 33.0.3).
// It only ever connects to 127.0.0.1, subscribes to no event, and every outgoing message goes through
// allowedMessage(): an Identify, or CallVendorRequest { vendorName: "obs-browser", requestType: "emit_event" }.
// The password never leaves this file: only the SHA-256 challenge answer goes on the wire.
// What this does NOT do (obs-websocket offers no way to): limit what the password allows (it opens all
// of OBS), authenticate the server (anything listening on the port can send a Hello), encrypt (no TLS).

export const HOST = "127.0.0.1";
export const DEFAULT_PORT = 4455;
export const RPC_VERSION = 1;
export const SUBPROTOCOL = "obswebsocket.json";
const OP = { Hello: 0, Identify: 1, Identified: 2, Request: 6, RequestResponse: 7 } as const;
// WebSocketCloseCode (obs-websocket src/websocketserver/types/WebSocketCloseCode.h)
const CLOSE_AUTH_FAILED = 4009;
const CLOSE_UNSUPPORTED_RPC = 4010;
const CLOSE_SESSION_INVALIDATED = 4011; // "Kick" in OBS (Tools -> WebSocket Server Settings -> sessions)
const STATUS_NOT_READY = 207; // OBS still loading
const STATUS_RESOURCE_NOT_FOUND = 600; // CallVendorRequest on a vendor that is not registered

/** obs-browser pastes the event name, unescaped, into JavaScript (browser-app.cpp): only [a-z-]. */
export const SAFE_EVENT_NAME = /^[a-z][a-z-]{0,31}$/;

/** off: no port set · connecting · ok: identified · open: identified, but OBS asks for NO password ·
 *  needpass: OBS asks for a password and none is saved (nothing sent) · auth: password refused ·
 *  unreachable: nothing listens (OBS closed or its WebSocket server disabled) · kicked: OBS closed the
 *  session (Kick button) · rpc: obs-websocket too old/new · noplugin: no obs-browser in this OBS · error */
export type ObsState = "off" | "connecting" | "ok" | "open" | "needpass" | "auth" | "unreachable" | "kicked" | "rpc" | "noplugin" | "error";

/** Closed list of what this client may send. Not a security boundary (the password allows everything
 *  to whoever holds it): a guard, tested, so that no code path sends any other request by mistake. */
export function allowedMessage(m: unknown): boolean {
  if (typeof m !== "object" || m === null) return false;
  const { op, d } = m as { op?: unknown; d?: Record<string, unknown> };
  if (typeof d !== "object" || d === null) return false;
  const keys = Object.keys(d).sort().join(",");
  if (op === OP.Identify) {
    return d.rpcVersion === RPC_VERSION && d.eventSubscriptions === 0 && (keys === "eventSubscriptions,rpcVersion" ||
      (keys === "authentication,eventSubscriptions,rpcVersion" && typeof d.authentication === "string"));
  }
  if (op !== OP.Request || keys !== "requestData,requestId,requestType" || d.requestType !== "CallVendorRequest" || typeof d.requestId !== "string") return false;
  const v = d.requestData as Record<string, unknown> | null;
  if (typeof v !== "object" || v === null || Object.keys(v).sort().join(",") !== "requestData,requestType,vendorName") return false;
  if (v.vendorName !== "obs-browser" || v.requestType !== "emit_event") return false;
  const e = v.requestData as Record<string, unknown> | null;
  return typeof e === "object" && e !== null && Object.keys(e).sort().join(",") === "event_data,event_name" &&
    typeof e.event_name === "string" && SAFE_EVENT_NAME.test(e.event_name) &&
    typeof e.event_data === "object" && e.event_data !== null && !Array.isArray(e.event_data);
}

export function validPort(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 65535;
}

/** The only URL this client can open. */
export function obsUrl(port: number): string {
  if (!validPort(port)) throw new Error("bad port");
  return `ws://${HOST}:${port}`;
}

function b64(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}
async function sha256b64(s: string): Promise<string> {
  return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** obs-websocket v5: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export async function authString(password: string, salt: string, challenge: string): Promise<string> {
  return sha256b64((await sha256b64(password + salt)) + challenge);
}

export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface ObsDeps {
  WS: new (url: string, protocols: string) => WsLike;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  random: () => number;
  onState: (s: ObsState) => void;
  onReady: () => void; // identified: time to send the current state
}

/** Delay before reconnecting: 1 s, 2 s, 4 s ... 15 s (with jitter); 60 s when trying again at once
 *  cannot help (password refused or missing, session kicked, incompatible version). */
export function retryDelay(failures: number, state: ObsState, random: () => number): number {
  if (state === "auth" || state === "needpass" || state === "kicked" || state === "rpc") return 60_000;
  const base = Math.min(15_000, 1000 * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export class ObsLink {
  private d: ObsDeps;
  private port = 0;
  private password = "";
  private ws: WsLike | null = null;
  private identified = false;
  private failures = 0;
  private timer: unknown;
  private seq = 0;
  private state: ObsState = "off";
  private noAuth = false; // the last Hello asked for no password
  private closing: ObsState | null = null; // this client closed the socket, for this reason

  constructor(d: ObsDeps) {
    this.d = d;
  }

  get current(): ObsState {
    return this.state;
  }

  get ready(): boolean {
    return this.identified;
  }

  private set(s: ObsState): void {
    if (s === this.state) return;
    this.state = s;
    this.d.onState(s);
  }

  /** (Re)connect with these settings. Port 0 = disconnected. force: try again now even if nothing
   *  changed here (the user pressed "save": the password may have just been applied in OBS). */
  configure(port: number, password: string, force = false): void {
    if (!force && port === this.port && password === this.password && this.ws) return;
    this.port = validPort(port) ? port : 0;
    this.password = typeof password === "string" ? password : "";
    this.failures = 0;
    this.drop();
    if (!this.port) return this.set("off");
    this.set("connecting");
    this.connect();
  }

  /** Connects again now if the link is down (e.g. the service worker woke up). */
  poke(): void {
    if (this.port && !this.ws && this.timer === undefined) this.connect(); // a planned retry keeps its delay
  }

  private drop(): void {
    this.d.clearTimeout(this.timer);
    this.timer = undefined;
    const ws = this.ws;
    this.ws = null;
    this.identified = false;
    this.closing = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close(1000);
      } catch {
        /* already closed */
      }
    }
  }

  private connect(): void {
    let ws: WsLike;
    try {
      ws = new this.d.WS(obsUrl(this.port), SUBPROTOCOL);
    } catch {
      this.set("error");
      return;
    }
    this.ws = ws; // retries keep the last state (unreachable, auth) instead of blinking "connecting"
    ws.onmessage = (ev) => void this.onMessage(ws, ev.data);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const wasIdentified = this.identified;
      this.identified = false;
      this.failures++;
      if (ev.code === CLOSE_AUTH_FAILED) this.set("auth");
      else if (ev.code === CLOSE_UNSUPPORTED_RPC) this.set("rpc");
      else if (ev.code === CLOSE_SESSION_INVALIDATED) this.set("kicked");
      else if (this.closing) this.set(this.closing);
      else if (wasIdentified) this.set("unreachable");
      else if (!["auth", "needpass", "kicked", "rpc"].includes(this.state)) this.set(ev.code === 1006 ? "unreachable" : "error");
      this.closing = null;
      this.timer = this.d.setTimeout(() => {
        this.timer = undefined;
        this.connect();
      }, retryDelay(this.failures, this.state, this.d.random));
    };
  }

  private async onMessage(ws: WsLike, raw: unknown): Promise<void> {
    if (this.ws !== ws || typeof raw !== "string" || raw.length > 65536) return;
    let m: { op?: unknown; d?: Record<string, unknown> };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof m !== "object" || m === null || typeof m.d !== "object" || m.d === null) return;
    if (m.op === OP.Hello) {
      // eventSubscriptions left out would mean "All" (protocol.md): 0 = EventSubscription::None.
      const d: Record<string, unknown> = { rpcVersion: RPC_VERSION, eventSubscriptions: 0 };
      const auth = m.d.authentication as { challenge?: unknown; salt?: unknown } | undefined;
      this.noAuth = auth === undefined;
      if (auth !== undefined) {
        if (typeof auth?.challenge !== "string" || typeof auth.salt !== "string") return this.abort(ws, "error");
        // No saved password: say so instead of sending a guess OBS would refuse (and log as a failure).
        if (this.password === "") return this.abort(ws, "needpass");
        d.authentication = await authString(this.password, auth.salt, auth.challenge);
      }
      if (this.ws === ws) this.send(ws, { op: OP.Identify, d });
    } else if (m.op === OP.Identified) {
      this.identified = true;
      this.failures = 0;
      this.set(this.noAuth ? "open" : "ok");
      this.d.onReady();
    } else if (m.op === OP.RequestResponse) {
      const st = m.d.requestStatus as { result?: unknown; code?: unknown } | undefined;
      if (st?.result === true) this.set(this.noAuth ? "open" : "ok");
      else if (st?.code === STATUS_NOT_READY) this.set("connecting");
      else this.set(st?.code === STATUS_RESOURCE_NOT_FOUND ? "noplugin" : "error");
    }
  }

  /** Every outgoing message: only what allowedMessage() accepts ever reaches the socket. */
  private send(ws: WsLike, msg: object): boolean {
    if (!allowedMessage(msg)) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  private abort(ws: WsLike, why: ObsState): void {
    if (this.ws !== ws) return;
    this.closing = why;
    try {
      ws.close(1000);
    } catch {
      /* already closed */
    }
  }

  /** Sends one obs-browser event to every browser source of OBS. False when not connected. */
  emit(eventName: string, eventData: object): boolean {
    if (!this.ws || !this.identified || this.ws.readyState !== 1) return false;
    this.seq = (this.seq + 1) % 1e9;
    return this.send(this.ws, {
      op: OP.Request,
      d: {
        requestType: "CallVendorRequest",
        requestId: "sillonette-" + this.seq,
        requestData: { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name: eventName, event_data: eventData } },
      },
    });
  }

  close(): void {
    this.port = 0;
    this.drop();
    this.set("off");
  }
}
