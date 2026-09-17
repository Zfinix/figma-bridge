// One-shot probe: call a plugin method through the relay and print the result.
// Usage: bun server/probe.ts <method> [jsonParams]
const ws = new WebSocket('ws://127.0.0.1:4395/server');

const method = process.argv[2] ?? 'ping';
const params = process.argv[3] ? JSON.parse(process.argv[3]) : {};

let cid = 1;
function call(method: string, params: unknown): Promise<unknown> {
  return new Promise((res, rej) => {
    const mid = cid++;
    const t = setTimeout(() => rej(new Error('timeout waiting for ' + method)), 15000);
    const on = (e: MessageEvent) => {
      const m = JSON.parse(e.data);
      if (m.cid !== mid) return;
      clearTimeout(t);
      ws.removeEventListener('message', on);
      m.ok ? res(m.result) : rej(new Error(m.error));
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ cid: mid, method, params }));
  });
}

ws.onopen = async () => {
  try {
    const r = await call(method, params);
    console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  } catch (e) {
    console.log('FAIL:', (e as Error).message);
  }
  process.exit(0);
};
ws.onerror = () => { console.log('FAIL: relay unreachable on 4395'); process.exit(1); };