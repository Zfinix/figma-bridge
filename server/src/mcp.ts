/**
 * MCP protocol handler: JSON-RPC 2.0 over stdio.
 */

import { z } from "zod";
import { log } from "./logger";
import { readTools } from "./tools/read";
import { mutateTools } from "./tools/mutate";
import { pageTools } from "./tools/pages";
import type { Tool } from "./tools/registry";
import { text } from "./tools/registry";
import { InitializeParams, RpcRequest, ToolsCallParams, isNotification } from "./rpc";

export const SERVER_INFO = { name: "figma-bridge", version: "0.3.0" };

const TOOLS: Record<string, Tool> = { ...readTools, ...mutateTools, ...pageTools };

function reply(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function errReply(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handle(raw: unknown) {
  const parsed = RpcRequest.safeParse(raw);
  if (!parsed.success) {
    log.warn({ raw }, "bad request");
    return errReply(null, -32600, "invalid request");
  }
  const { id, method, params } = parsed.data;

  switch (method) {
    case "initialize": {
      const p = InitializeParams.safeParse(params ?? {});
      return reply(id, {
        protocolVersion: p.success ? p.data.protocolVersion ?? "2025-06-18" : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    case "notifications/initialized":
      return undefined;
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.annotations ? { annotations: t.annotations } : {}),
        })),
      });
    case "tools/call":
      return toolsCall(id, params);
    default:
      if (isNotification(method)) return undefined;
      return errReply(id, -32601, `method not found: ${method}`);
  }
}

async function toolsCall(id: unknown, params: unknown) {
  const p = ToolsCallParams.safeParse(params ?? {});
  if (!p.success) return errReply(id, -32602, "tools/call requires name");
  const { name } = p.data;
  const tool = TOOLS[name];
  if (!tool) return errReply(id, -32602, `unknown tool: ${name}`);

  const started = Date.now();
  try {
    const content = await tool.run(p.data.arguments ?? {});
    log.info({ name, ms: Date.now() - started }, "tool ok");
    return reply(id, { content, isError: false });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    log.error({ name, ms: Date.now() - started, error: msg }, "tool failed");
    return reply(id, { content: text(`Error: ${msg}`), isError: true });
  }
}