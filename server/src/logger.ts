/**
 * Logging via pino, stderr only. stdout carries the MCP protocol, so nothing
 * here may touch it. Level via FIGMA_BRIDGE_LOG: debug | info | warn | error.
 */

import pino from "pino";

export const log = pino(
  {
    level: process.env.FIGMA_BRIDGE_LOG ?? "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ fd: 2, sync: false }),
);
