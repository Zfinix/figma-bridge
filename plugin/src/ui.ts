/**
 * figma-bridge plugin UI iframe.
 *
 * Owns the WebSocket (the main plugin sandbox has none) and shuttles
 * requests to the Plugin API sandbox over postMessage. Reconnects with
 * exponential backoff, capped at 10s.
 */

const RELAY_URL = "ws://localhost:4395/plugin";
const MAX_BACKOFF_MS = 10_000;

let ws: WebSocket | null = null;
let backoff = 500;

const statusEl = document.getElementById("status") as HTMLElement;

function setStatus(text: string, color: string) {
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function connect() {
  try {
    ws = new WebSocket(RELAY_URL);
  } catch (err) {
    setStatus("blocked: " + (err instanceof Error ? err.message : String(err)), "#f66");
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoff = 500;
    setStatus("connected", "#6f6");
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

  ws.onclose = () => {
    ws = null;
    setStatus("relay unreachable, retrying\u2026", "#f96");
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
  if (!d || d.source !== "figma-bridge" || d.type !== "response") return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: d.id, ok: d.ok, result: d.result, error: d.error }));
  }
};

connect();
