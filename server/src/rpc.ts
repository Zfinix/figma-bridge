/**
 * JSON-RPC 2.0 message schemas, typed with Zod.
 */

import { z } from "zod";

export const RpcId = z.union([z.string(), z.number()]).optional();

export const RpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: RpcId,
  method: z.string(),
  params: z.unknown().optional(),
});

export const InitializeParams = z.object({
  protocolVersion: z.string().optional(),
}).loose();

export const ToolsCallParams = z.object({
  name: z.string(),
  arguments: z.unknown().optional(),
});

export function isNotification(method: string): boolean {
  return method.startsWith("notifications/");
}