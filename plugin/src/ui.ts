/**
 * figma-bridge plugin UI iframe.
 *
 * Owns the WebSocket (the main plugin sandbox has none) and shuttles
 * requests to the Plugin API sandbox over postMessage. Reconnects with
 * exponential backoff, capped at 10s.
 */

const RELAY_URL = "ws://localhost:4395/plugin";
const MAX_BACKOFF_MS = 10_000;
const REPLACED_CODE = 4001;

let ws: WebSocket | null = null;
let backoff = 500;

let lastStatus = "";

function setStatus(text: string, error = false) {
  if (text === lastStatus) return;
  lastStatus = text;
  parent.postMessage({ pluginMessage: { source: "figma-bridge", type: "status", text, error } }, "*");
}

function connect() {
  console.log(`[figma-bridge] dialing ${RELAY_URL}`);
  try {
    ws = new WebSocket(RELAY_URL);
  } catch (err) {
    console.log(`[figma-bridge] dial failed: ${err}`);
    setStatus("figma-bridge blocked: " + (err instanceof Error ? err.message : String(err)), true);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoff = 500;
    console.log("[figma-bridge] relay connected");
    setStatus("figma-bridge connected");
  };

  ws.onmessage = (event) => {
    let msg: { id?: unknown; method?: unknown; params?: unknown };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (typeof msg.id !== "number" || typeof msg.method !== "string") return;
    parent.postMessage(
      {
        pluginMessage: {
          source: "figma-bridge",
          type: "request",
          id: msg.id,
          method: msg.method,
          params: msg.params ?? {},
        },
      },
      "*"
    );
  };

  ws.onclose = (event) => {
    ws = null;
    if (event.code === REPLACED_CODE) {
      setStatus("figma-bridge moved to another Figma window");
      return;
    }
    console.log("[figma-bridge] relay closed the socket, retrying");
    setStatus("figma-bridge relay unreachable, retrying\u2026", true);
    scheduleReconnect();
  };

  ws.onerror = () => {
    try {
      ws?.close();
    } catch {}
  };
}

function scheduleReconnect() {
  const wait = backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  setTimeout(connect, wait);
}

window.onmessage = (event) => {
  const d = event.data && event.data.pluginMessage;
  if (!d || d.source !== "figma-bridge") return;
  if (d.type === "response") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: d.id, ok: d.ok, result: d.result, error: d.error }));
    }
  } else if (d.type === "event") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "event", name: d.name, nodes: d.nodes }));
    }
  }
};

connect();
