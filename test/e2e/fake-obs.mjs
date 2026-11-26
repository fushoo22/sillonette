// Fake OBS for the end-to-end tests: an obs-websocket v5 server (JSON subprotocol) written
// from the protocol documentation (obs-websocket docs/generated/protocol.md), plus the obs-browser
// vendor request "emit_event" (obs-browser-plugin.cpp). No dependency: a minimal RFC 6455 server.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const sha = (s) => createHash("sha256").update(s).digest("base64");

/**
 * onEmit(eventName, eventDataJson) mimics obs-browser: it must dispatch
 * `new CustomEvent(eventName, { detail: JSON.parse(eventDataJson) })` on window in every browser source.
 */
export async function startFakeObs({ port, password, onEmit, vendor = true }) {
  const log = { raw: [], requests: [], identifies: [], origins: [], protocols: [], authFailures: 0, connections: 0 };
  const sockets = new Set();
  const server = createServer((_, res) => { res.writeHead(426); res.end(); });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key || req.headers.upgrade?.toLowerCase() !== "websocket") return socket.destroy();
    log.connections++;
    log.origins.push(req.headers.origin ?? "");
    const protos = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    log.protocols.push(protos.join(","));
    if (protos.length && !protos.includes("obswebsocket.json")) return socket.destroy();
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade",
      "Sec-WebSocket-Accept: " + createHash("sha1").update(key + GUID).digest("base64"),
      ...(protos.length ? ["Sec-WebSocket-Protocol: obswebsocket.json"] : []), "", ""].join("\r\n"));
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());

    const salt = randomBytes(32).toString("base64"), challenge = randomBytes(32).toString("base64");
    let identified = false;
    const send = (obj) => frame(socket, 1, Buffer.from(JSON.stringify(obj)));
    const close = (code) => { frame(socket, 8, Buffer.from([code >> 8, code & 255])); socket.end(); };
    send({ op: 0, d: { obsStudioVersion: "33.0.3", obsWebSocketVersion: "5.7.6", rpcVersion: 1, ...(password ? { authentication: { challenge, salt } } : {}) } });

    let buf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const f = parse(buf);
        if (!f) return;
        buf = buf.subarray(f.length);
        if (f.op === 8) { frame(socket, 8, f.payload.subarray(0, 2)); socket.end(); return; }
        if (f.op === 9) { frame(socket, 10, f.payload); continue; }
        if (f.op !== 1) { close(4002); return; } // binary frame with the JSON subprotocol: MessageDecodeError
        const text = f.payload.toString("utf8");
        log.raw.push(text);
        let m;
        try { m = JSON.parse(text); } catch { close(4002); return; }
        if (!identified) {
          if (m.op !== 1) { close(4007); return; } // NotIdentified
          log.identifies.push(m.d);
          if (password && m.d?.authentication !== sha(sha(password + salt) + challenge)) { log.authFailures++; close(4009); return; }
          identified = true;
          send({ op: 2, d: { negotiatedRpcVersion: 1 } });
          continue;
        }
        if (m.op !== 6) continue;
        const { requestType, requestId, requestData } = m.d;
        log.requests.push(m.d);
        const reply = (code, responseData) => send({ op: 7, d: { requestType, requestId, requestStatus: { result: code === 100, code }, ...(responseData ? { responseData } : {}) } });
        if (requestType !== "CallVendorRequest") { reply(204); continue; }
        if (!vendor || requestData?.vendorName !== "obs-browser") { reply(600); continue; }
        if (requestData.requestType !== "emit_event") { reply(204); continue; }
        const rd = requestData.requestData ?? {};
        // obs-browser: obs_data_get_obj(event_data) then obs_data_get_json, "{}" when absent
        const json = rd.event_data && typeof rd.event_data === "object" && !Array.isArray(rd.event_data) ? JSON.stringify(obsData(rd.event_data)) : "{}";
        if (typeof rd.event_name === "string" && rd.event_name) onEmit?.(rd.event_name, json);
        reply(100, { vendorName: "obs-browser", requestType: "emit_event", responseData: {} });
      }
    });
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    log,
    async stop() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}

/** What a round trip through libobs obs_data does to JSON (obs-data.c): array items that are not
 *  objects are dropped, null becomes an empty object slot (left out here). */
export function obsData(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null) continue;
    if (Array.isArray(v)) out[k] = v.filter((x) => x && typeof x === "object" && !Array.isArray(x)).map(obsData);
    else if (typeof v === "object") out[k] = obsData(v);
    else out[k] = v;
  }
  return out;
}

function frame(socket, op, payload) {
  if (socket.destroyed) return;
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => {
    const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b;
  })();
  socket.write(Buffer.concat([head, payload]));
}

function parse(buf) {
  if (buf.length < 2) return null;
  const op = buf[0] & 15, masked = buf[1] & 0x80;
  let len = buf[1] & 127, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  if (!masked) throw new Error("client frames must be masked");
  if (buf.length < off + 4 + len) return null;
  const mask = buf.subarray(off, off + 4);
  const payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { op, payload, length: off + 4 + len };
}
