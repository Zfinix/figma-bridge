/**
 * Tool registry: tool definition shape, Zod-driven schemas, and content
 * helpers shared by every tool module.
 */

import { z } from "zod";
import { exec } from "../relay-client";
import { MAX_RESULT_CHARS } from "../util";

export type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean };

/** S is a plain z.ZodType (no generics): Zod v4 deprecates generic ZodType args. */
export type ToolDef<S extends z.ZodType = z.ZodType> = {
  description: string;
  schema: S;
  annotations?: Annotations;
  run: (args: z.output<S>) => Promise<Content[]>;
};

export type Tool = {
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Annotations;
  run: (args: unknown) => Promise<Content[]>;
};

export function text(t: string): Content[] {
  const clipped =
    t.length > MAX_RESULT_CHARS ? t.slice(0, MAX_RESULT_CHARS) + "...[truncated]" : t;
  return [{ type: "text", text: clipped }];
}

export function json(v: unknown): Content[] {
  return text(JSON.stringify(v, null, 2));
}

export function image(data: string, mimeType: string): Content {
  return { type: "image", data, mimeType };
}

export function defineTool<S extends z.ZodType>(def: ToolDef<S>): Tool {
  return {
    description: def.description,
    annotations: def.annotations,
    inputSchema: inputSchemaOf(def.schema),
    run: (raw: unknown) => def.run(def.schema.parse(raw)),
  };
}

function inputSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export { exec };
