/**
 * Relay client: WebSocket connection to the relay daemon (server/relay.ts) on
 * 127.0.0.1:4395, which routes calls to the plugin running inside Figma.
 * Spawns the relay if it is not already running, so several aster sessions can
 * share one plugin connection without port conflicts.
 */

import { log } from "./logger";
import { CALL_TIMEOUT_MS } from "./util";

const RELAY_URL = "ws://127.0.0.1:4395/server";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let relay: WebSocket | null = null;
const pending = new Map<number, Pending>();
let nextCallId = 1;
let lastSelection: { nodes: any[]; at: number } | null = null;

export function selectionCache() {
  return lastSelection;
}

function spawnRelay() {
  const script = new URL("../relay.ts", import.meta.url).pathname;
  try {
    const proc = Bun.spawn(["bun", script], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();
  } catch {}
}

function connectRelay(): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(RELAY_URL);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {}
        reject(new Error("relay connect timed out"));
      }
    }, 2000);
    ws.onopen = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        relay = ws;
        resolve();
      }
    };
    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.event === "selectionchange") {
        lastSelection = { nodes: msg.nodes ?? [], at: Date.now() };
        return;
      }
      const entry = pending.get(msg.cid);
      if (!entry) return;
      pending.delete(msg.cid);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error ?? "unknown plugin error"));
    };
    ws.onclose = () => {
      relay = null;
      rejectAllPending(new Error("Relay connection lost. Re-run the plugin and retry."));
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("relay closed before connect"));
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  });
}

async function ensureRelay() {
  if (relay && relay.readyState === 1) return;
  try {
    await connectRelay();
    return;
  } catch {}
  // Relay not up: spawn the daemon and wait for the port.
  spawnRelay();
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      await connectRelay();
      return;
    } catch {}
  }
  throw new Error(
    "Could not start the figma-bridge relay on 127.0.0.1:4395. Start it manually: bun server/relay.ts",
  );
}

export function callPlugin(method: string, params: unknown): Promise<unknown> {
  return ensureRelay().then(
    () =>
      new Promise((resolve, reject) => {
        const cid = nextCallId++;
        const timer = setTimeout(() => {
          pending.delete(cid);
          reject(new Error(`Figma call ${method} timed out after ${CALL_TIMEOUT_MS / 1000}s`));
        }, CALL_TIMEOUT_MS);
        pending.set(cid, { resolve, reject, timer });
        relay!.send(JSON.stringify({ cid, method, params }));
        log.debug({ method, cid }, "plugin call");
      }),
  );
}

function rejectAllPending(err: Error) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  pending.clear();
}

/** Run arbitrary Plugin API code inside Figma; resolves with the last expression's value. */
export function exec(code: string): Promise<unknown> {
  return callPlugin("execute", { code });
}
