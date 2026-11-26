// obs-websocket auth and client, lease between tabs, event validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { allowedMessage, authString, obsUrl, ObsLink, retryDelay, validPort } from "../../src/background/obsws.ts";
import { emptyLease, report, removeTab, view, cleanLease, LEASE_MS, IDLE_MS } from "../../src/background/lease.ts";
import { EVENT_NAME, parseOverlayEvent, MAX_EVENT_BYTES } from "../../src/shared/event.ts";
import { encodeTheme, normalizeTheme } from "../../src/shared/config.ts";

const sha = (s) => createHash("sha256").update(s).digest("base64");

test("obs-websocket v5 authentication string", async () => {
  const pw = "supersecretpassword", salt = "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", ch = "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=";
  assert.equal(await authString(pw, salt, ch), sha(sha(pw + salt) + ch));
  assert.equal(await authString("é€😀", "s", "c"), sha(sha("é€😀s") + "c"), "UTF-8 password");
});

test("only 127.0.0.1, valid ports", () => {
  assert.equal(obsUrl(4455), "ws://127.0.0.1:4455");
  for (const p of [0, -1, 65536, 1.5, "4455", NaN, null]) {
    assert.equal(validPort(p), false, String(p));
    assert.throws(() => obsUrl(p));
  }
  assert.equal(retryDelay(1, "unreachable", () => 0.5), 1000);
  assert.equal(retryDelay(10, "unreachable", () => 0.5), 15000);
  assert.equal(retryDelay(1, "auth", () => 0.5), 60000);
});

/** Fake WebSocket driven by the test. */
function fakeWs() {
  const all = [];
  class WS {
    constructor(url, proto) { this.url = url; this.proto = proto; this.readyState = 0; this.sent = []; all.push(this); }
    send(d) { this.sent.push(JSON.parse(d)); }
    close(code = 1005) { // like a browser: a close started here still ends with a close event
      if (this.readyState === 3) return;
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.({ code }));
    }
    server(msg) { this.readyState = 1; this.onmessage?.({ data: JSON.stringify(msg) }); }
    drop(code) { this.readyState = 3; this.onclose?.({ code }); }
  }
  return { WS, all };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

test("ObsLink: Hello with auth -> Identify (no events) -> only CallVendorRequest emit_event", async () => {
  const { WS, all } = fakeWs();
  const states = [];
  let ready = 0;
  const timers = [];
  const link = new ObsLink({ WS, setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {}, random: () => 0.5, onState: (s) => states.push(s), onReady: () => ready++ });
  assert.equal(link.emit("x", {}), false, "nothing before connecting");
  link.configure(4455, "pw");
  const ws = all[0];
  assert.equal(ws.url, "ws://127.0.0.1:4455");
  assert.equal(ws.proto, "obswebsocket.json");
  ws.server({ op: 0, d: { rpcVersion: 1, authentication: { salt: "S", challenge: "C" } } });
  await tick();
  assert.deepEqual(ws.sent[0], { op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, authentication: sha(sha("pwS") + "C") } });
  assert.equal(link.emit("sillonette", { a: 1 }), false, "nothing before Identified");
  ws.server({ op: 2, d: { negotiatedRpcVersion: 1 } });
  assert.equal(ready, 1);
  assert.equal(link.emit("sillonette", { a: 1 }), true);
  const req = ws.sent[1];
  assert.equal(req.op, 6);
  assert.equal(req.d.requestType, "CallVendorRequest");
  assert.deepEqual(req.d.requestData, { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name: "sillonette", event_data: { a: 1 } } });
  assert.ok(!JSON.stringify(ws.sent).includes("pw\""), "the password itself is never sent");
  ws.server({ op: 7, d: { requestType: "CallVendorRequest", requestId: req.d.requestId, requestStatus: { result: false, code: 600 } } });
  assert.equal(link.current, "noplugin");
  // OBS closes: reconnect scheduled
  ws.drop(1001);
  assert.equal(link.current, "unreachable");
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(all.length, 2);
  // wrong password
  all[1].server({ op: 0, d: { rpcVersion: 1, authentication: { salt: "S", challenge: "C" } } });
  await tick();
  all[1].drop(4009);
  assert.equal(link.current, "auth");
  assert.equal(timers[1].ms, 60000);
  assert.deepEqual(states, ["connecting", "ok", "noplugin", "unreachable", "auth"]);
});

const T = (title, state = "playing") => ({ state, title, artist: "A", album: "B", art: "", dur: 200000, pos: 1000, rate: 1, ad: false, ready: true });

test("lease: first playing tab wins, the other is refused (E10), hand-over on pause / close", () => {
  let l = emptyLease();
  l = report(l, 1, T("one"), 0);
  l = report(l, 2, T("two"), 100);
  let v = view(l, 200);
  assert.equal(v.shown.track.title, "one");
  assert.equal(v.conflicts, 1);
  l = report(l, 1, T("one", "paused"), 300); // owner pauses: tab 2 takes over at once
  v = view(l, 400);
  assert.equal(v.shown.track.title, "two");
  assert.equal(v.conflicts, 0);
  l = report(l, 1, T("one"), 500); // tab 1 plays again: refused now
  assert.equal(view(l, 600).shown.track.title, "two");
  assert.equal(view(l, 600).conflicts, 1);
  l = removeTab(l, 2, 700);
  assert.equal(view(l, 800).shown.track.title, "one");
  l = removeTab(l, 1, 900);
  assert.equal(view(l, 1000).shown, null);
});

test("lease: expiry, idle, stopped, paused tabs never steal", () => {
  let l = report(emptyLease(), 1, T("one"), 0);
  l = report(l, 2, T("two", "paused"), 10);
  assert.equal(view(l, 20).shown.track.title, "one", "a paused tab does not replace a playing owner");
  l = report(l, 3, T("three"), 100);
  assert.equal(view(l, LEASE_MS - 1).shown.track.title, "one");
  assert.equal(view(l, LEASE_MS + 1).shown.track.title, "three", "silent owner: lease expires");
  l = report(emptyLease(), 1, T("one", "paused"), 0);
  assert.equal(view(l, IDLE_MS - 1).shown.track.title, "one");
  assert.equal(view(l, IDLE_MS + 1).shown, null, "forgotten after IDLE_MS of silence");
  l = report(report(emptyLease(), 1, T("one"), 0), 1, null, 10);
  assert.equal(view(l, 20).shown, null, "stopped");
  assert.deepEqual(cleanLease({ tabs: { x: 1, 5: { at: "no" } }, owner: "9" }), emptyLease());
  assert.deepEqual(cleanLease(null), emptyLease());
});

test("overlay validates every event", () => {
  const np = { v: 1, state: "playing", title: "  T‮itle  ", artist: "A", album: "", art: "https://lh3.googleusercontent.com/x=w544", dur: 1000, pos: 10, rate: 1, at: 5, now: 6, extra: "<b>" };
  const ok = parseOverlayEvent({ v: 1, np, theme: encodeTheme(normalizeTheme({ sk: "neon", ly: "v" })), err: "E10" });
  assert.equal(ok.np.title, "Title");
  assert.equal(ok.np.extra, undefined);
  assert.equal(ok.theme.sk, "neon");
  assert.equal(ok.theme.ly, "v");
  assert.deepEqual(ok.theme.sh, ["art", "artist", "prog"]);
  const forged = Buffer.from(JSON.stringify({ v: 1, sk: "neon", ac: "javascript:alert(1)", sh: ["x"] })).toString("base64url");
  assert.equal(parseOverlayEvent({ v: 1, np, theme: forged }).theme.ac, "#ff4fd8", "invalid colour -> skin default");
  assert.equal(parseOverlayEvent({ v: 1, np, theme: { sk: "neon" } }).theme.sk, "studio", "theme must be the encoded string");
  assert.equal(ok.err, "E10");
  assert.equal(parseOverlayEvent({ v: 1, np: { ...np, art: "https://evil.example/x.png" } }).np.art, "", "artwork host not allowed");
  assert.equal(parseOverlayEvent({ v: 1, np: { ...np, art: "http://lh3.googleusercontent.com/x" } }).np.art, "");
  assert.equal(parseOverlayEvent({ v: 1, np, err: "E99" }).err, "");
  assert.equal(parseOverlayEvent({ v: 1, np: { ...np, title: "x".repeat(500) } }).np.title.length, 200);
  assert.equal(parseOverlayEvent({ v: 1, np: { ...np, dur: 1e15, pos: -5, rate: 99 } }).np.rate, 4);
  for (const bad of [null, 1, "x", [], { v: 2, np }, { v: 1 }, { v: 1, np: { ...np, title: "" } }, { v: 1, np: { ...np, state: "hack" } },
    { v: 1, np: { ...np, now: "1" } }, { v: 1, np, pad: "x".repeat(MAX_EVENT_BYTES) }]) {
    assert.equal(parseOverlayEvent(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
  assert.deepEqual(parseOverlayEvent({ v: 1, np: { v: 1, state: "idle", now: 3, title: "x" } }).np, { v: 1, state: "idle", now: 3 });
});

const emitReq = (event_name = "sillonette", event_data = { a: 1 }, extra = {}) => ({
  op: 6,
  d: { requestType: "CallVendorRequest", requestId: "sillonette-1", requestData: { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name, event_data }, ...extra } },
});

test("closed list of outgoing messages", () => {
  assert.match(EVENT_NAME, /^[a-z][a-z-]{0,31}$/, "the event name obs-browser pastes into JavaScript stays [a-z-]");
  assert.equal(allowedMessage({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0 } }), true);
  assert.equal(allowedMessage({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, authentication: "x" } }), true);
  assert.equal(allowedMessage(emitReq()), true);
  const refused = {
    "Identify without eventSubscriptions (= All)": { op: 1, d: { rpcVersion: 1 } },
    "Identify with events": { op: 1, d: { rpcVersion: 1, eventSubscriptions: 1023 } },
    "Identify, other field": { op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, x: 1 } },
    Reidentify: { op: 3, d: { eventSubscriptions: 0 } },
    "stream key": { op: 6, d: { requestType: "GetStreamServiceSettings", requestId: "1", requestData: {} } },
    StartStream: { op: 6, d: { requestType: "StartStream", requestId: "1", requestData: {} } },
    batch: { op: 8, d: { requestId: "1", requests: [emitReq().d] } },
    "other vendor": (() => { const m = emitReq(); m.d.requestData.vendorName = "other"; return m; })(),
    "other vendor request": (() => { const m = emitReq(); m.d.requestData.requestType = "x"; return m; })(),
    "event name with a quote (JavaScript injection in obs-browser)": emitReq("a');alert(1);('"),
    "event name upper case": emitReq("Sillonette"),
    "event data array": emitReq("sillonette", []),
    "event data string": emitReq("sillonette", "x"),
    "extra field": emitReq("sillonette", {}, { more: 1 }),
  };
  for (const [why, m] of Object.entries(refused)) assert.equal(allowedMessage(m), false, why);
  for (const bad of [null, 1, "x", {}, { op: 6 }, { op: 6, d: null }]) assert.equal(allowedMessage(bad), false);
});

function newLink() {
  const { WS, all } = fakeWs();
  const states = [];
  const timers = [];
  let ready = 0;
  const link = new ObsLink({ WS, setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {}, random: () => 0.5, onState: (s) => states.push(s), onReady: () => ready++ });
  return { link, all, states, timers, ready: () => ready };
}

test("ObsLink: save again with the same settings tries again at once", async () => {
  const t = fakeWs();
  const link = new ObsLink({ WS: t.WS, setTimeout: () => 1, clearTimeout: () => {}, random: () => 0.5, onState: () => {}, onReady: () => {} });
  link.configure(4455, "pw");
  link.configure(4455, "pw");
  assert.equal(t.all.length, 1, "unchanged and still connecting: nothing to do");
  link.configure(4455, "pw", true);
  assert.equal(t.all.length, 2, "forced: new connection");
  assert.equal(t.all[0].readyState, 3, "the previous socket is closed");
});

test("ObsLink: OBS without a password -> connected, with a warning state", async () => {
  const t = newLink();
  t.link.configure(4455, "saved-but-unused");
  t.all[0].server({ op: 0, d: { rpcVersion: 1 } });
  await tick();
  assert.deepEqual(t.all[0].sent[0], { op: 1, d: { rpcVersion: 1, eventSubscriptions: 0 } }, "no authentication field");
  t.all[0].server({ op: 2, d: { negotiatedRpcVersion: 1 } });
  assert.equal(t.link.current, "open");
  assert.equal(t.link.emit("sillonette", { a: 1 }), true);
  t.all[0].server({ op: 7, d: { requestStatus: { result: true, code: 100 } } });
  assert.equal(t.link.current, "open", "a successful request keeps the warning");
});

test("ObsLink: OBS asks for a password and none is saved -> nothing sent, waits a minute", async () => {
  const t = newLink();
  t.link.configure(4455, "");
  t.all[0].server({ op: 0, d: { rpcVersion: 1, authentication: { salt: "S", challenge: "C" } } });
  await tick();
  assert.deepEqual(t.all[0].sent, [], "no Identify: no failed attempt in OBS");
  assert.equal(t.all[0].readyState, 3, "socket closed by the client");
  assert.equal(t.link.current, "needpass");
  assert.equal(t.timers.at(-1).ms, 60000);
  // malformed authentication object
  const u = newLink();
  u.link.configure(4455, "pw");
  u.all[0].server({ op: 0, d: { rpcVersion: 1, authentication: { salt: 1, challenge: "C" } } });
  await tick();
  assert.deepEqual(u.all[0].sent, []);
  assert.equal(u.link.current, "error");
});

test("ObsLink: close codes and request statuses become clear states", async () => {
  const t = newLink();
  t.link.configure(4455, "pw");
  t.all[0].drop(4010);
  assert.equal(t.link.current, "rpc");
  assert.equal(t.timers.at(-1).ms, 60000);
  t.timers.at(-1).fn();
  t.all[1].server({ op: 0, d: { rpcVersion: 1, authentication: { salt: "S", challenge: "C" } } });
  await tick();
  t.all[1].server({ op: 2, d: { negotiatedRpcVersion: 1 } });
  assert.equal(t.link.current, "ok");
  t.all[1].server({ op: 7, d: { requestStatus: { result: false, code: 207 } } });
  assert.equal(t.link.current, "connecting", "OBS not ready yet");
  t.all[1].drop(4011);
  assert.equal(t.link.current, "kicked");
  assert.equal(t.timers.at(-1).ms, 60000, "kicked: no immediate reconnection");
  assert.equal(t.link.emit("Bad'name", {}), false);
});

test("ObsLink: an unsafe event name is never sent", async () => {
  const t = newLink();
  t.link.configure(4455, "pw");
  t.all[0].server({ op: 0, d: { rpcVersion: 1 } });
  await tick();
  t.all[0].server({ op: 2, d: { negotiatedRpcVersion: 1 } });
  assert.equal(t.link.emit("x');alert(1);('", {}), false);
  assert.equal(t.link.emit("sillonette", []), false);
  assert.equal(t.all[0].sent.length, 1, "only the Identify");
});
