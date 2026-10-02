import { z, type Schema } from "./schema";

export interface BridgeRequest {
  source?: string;
  type?: string;
  text?: string;
  error?: boolean;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

/** A method handler: validated params in, Plugin API work, plain result out. */
export interface MethodDef {
  schema: Schema<unknown>;
  run: (params: any) => Promise<unknown> | unknown;
}

export const method = <S extends Schema<unknown>, T>(
  schema: S,
  run: (params: any) => Promise<T> | T,
): MethodDef => ({ schema, run: run as MethodDef["run"] });

export async function requireNode<T extends SceneNode | PageNode>(
  nodeId: string | undefined,
): Promise<T> {
  const node = await figma.getNodeByIdAsync(nodeId ?? "");
  if (!node) throw new Error(`no node ${nodeId}`);
  return node as T;
}