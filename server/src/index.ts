/**
 * figma-bridge MCP server entry: JSON-RPC over stdio, tools in src/tools/.
 */

import { handle } from "./mcp";
import { log } from "./logger";

const decoder = new TextDecoder();
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += decoder.decode(chunk, { stream: true });
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line))
        .then((out) => {
          if (out !== undefined) process.stdout.write(JSON.stringify(out) + "\n");
        })
        .catch((e) => log.error("handler crashed", { error: String(e) }));
    } catch {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) +
          "\n",
      );
    }
  }
});

process.stdin.on("end", () => process.exit(0));

log.info("figma-bridge mcp server started");