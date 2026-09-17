// Pretends to be the Figma plugin: connects to the relay and answers every
// request with a canned ping response. Used to verify the relay path without
// opening Figma.
const ws = new WebSocket("ws://127.0.0.1:4395/plugin");
ws.onopen = () => console.log("fake-plugin: connected");
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string);
  if (typeof msg.id !== "number") return;
  ws.send(
    JSON.stringify({
      id: msg.id,
      ok: true,
      result: { value: `fake-plugin answered ${msg.method}` },
    })
  );
};
ws.onerror = (err) => {
  console.error("fake-plugin error", err.message ?? err);
  process.exit(1);
};