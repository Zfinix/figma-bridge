import * as tree from "./tree";
import * as layout from "./layout";
import * as nodes from "./nodes";
import type { BridgeRequest, MethodDef } from "./protocol";

export const METHODS: Record<string, MethodDef> = {
  ping: nodes.ping,
  get_tree: tree.getTree,
  get_node: tree.getNode,
  get_layout: layout.getLayout,
  create_frame: nodes.createFrame,
  create_text: nodes.createText,
  set_properties: nodes.setProperties,
  delete_node: nodes.deleteNode,
  clone_node: nodes.cloneNode,
  set_image_fill: nodes.setImageFill,
  set_effects: nodes.setEffects,
  set_fills: nodes.setFills,
  set_strokes: nodes.setStrokes,
  import_component: nodes.importComponent,
  get_selection: nodes.getSelection,
  set_selection: nodes.setSelection,
  get_screenshot: nodes.screenshot,
  export_node: nodes.exportNode,
  notify: nodes.notify,
  execute: nodes.execute,
};

export function dispatch(msg: BridgeRequest): void {
  if (msg.type !== "request" || typeof msg.id !== "number" || typeof msg.method !== "string") return;
  const id: number = msg.id;
  const def = METHODS[msg.method];
  if (!def) {
    reply(id, false, null, `unknown method ${msg.method}`);
    return;
  }
  const parsed = def.schema.safeParse(msg.params ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ");
    reply(id, false, null, `bad params for ${msg.method}: ${issue}`);
    return;
  }
  Promise.resolve(def.run(parsed.data))
    .then((result) => reply(id, true, result, null))
    .catch((err) => reply(id, false, null, err instanceof Error ? err.message : String(err)));
}

function reply(id: number, ok: boolean, result: unknown, error: string | null) {
  figma.ui.postMessage({ source: "figma-bridge", type: "response", id, ok, result, error });
}