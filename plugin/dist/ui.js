(() => {
  // src/ui.ts
  var RELAY_URL = "ws://localhost:4395/plugin";
  var MAX_BACKOFF_MS = 1e4;
  var ws = null;
  var backoff = 500;
  var statusEl = document.getElementById("status");
  function setStatus(text, color) {
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
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof msg.id !== "number" || typeof msg.method !== "string")
        return;
      parent.postMessage({
        pluginMessage: {
          source: "figma-bridge",
          type: "request",
          id: msg.id,
          method: msg.method,
          params: msg.params ?? {}
        }
      }, "*");
    };
    ws.onclose = () => {
      ws = null;
      setStatus("relay unreachable, retrying…", "#f96");
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
    if (!d || d.source !== "figma-bridge" || d.type !== "response")
      return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: d.id, ok: d.ok, result: d.result, error: d.error }));
    }
  };
  connect();
})();
