/**
 * figma-bridge plugin main sandbox.
 *
 * Requests arrive from the UI iframe (which owns the WebSocket) over
 * postMessage, run here against the Plugin API, and the response goes
 * back the same way.
 */
declare function btoa(input: string): string;
declare function atob(input: string): string;

figma.showUI(__html__, { visible: false });

// Push selection changes so the relay always knows what the human is looking at.
function pushSelection() {
  figma.ui.postMessage({
    source: "figma-bridge",
    type: "event",
    name: "selectionchange",
    nodes: figma.currentPage.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
  });
}
figma.on("selectionchange", pushSelection);
pushSelection();

interface BridgeRequest {
  source?: string;
  type?: string;
  text?: string;
  error?: boolean;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

figma.ui.onmessage = async (msg: BridgeRequest) => {
  if (!msg || msg.source !== "figma-bridge") return;
  if (msg.type === "status") {
    figma.notify(String(msg.text), { error: msg.error });
    return;
  }
  if (msg.type !== "request") return;
  const response = await handle(msg);
  figma.ui.postMessage({ source: "figma-bridge", type: "response", id: msg.id, ...response });
};

async function handle(msg: BridgeRequest) {
  try {
    return { ok: true, result: await run(msg.method as string, msg.params ?? {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function run(method: string, params: Record<string, any>): Promise<unknown> {
  switch (method) {
    case "ping":
      return { file: figma.root.name, page: figma.currentPage.name };
    case "execute":
      return execute(params.code);
    case "get_tree":
      return getTree(params);
    case "set_image_fill":
      return setImageFill(params);
    case "get_node":
      return getNode(params.nodeId);
    case "get_screenshot":
      return screenshot(params);
    case "notify":
      figma.notify(String(params.message));
      return null;
    case "create_frame":
      return createFrame(params);
    case "create_text":
      return createText(params);
    case "set_properties":
      return setProperties(params);
    case "delete_node":
      return deleteNode(params.nodeId);
    case "clone_node":
      return cloneNode(params);
    case "set_fills":
      return paint(params, "fills");
    case "set_strokes":
      return paint(params, "strokes");
    case "set_effects":
      return setEffects(params);
    case "import_component":
      return importComponent(params);
    case "get_selection":
      return getSelection();
    case "set_selection":
      return setSelection(params.nodeIds);
    case "export_node":
      return exportNode(params);
    default:
      throw new Error(`unknown method ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

async function execute(code: string) {
  const fn = new Function("figma", `"use strict";\nreturn (async () => {\n${code}\n})();`);
  const value = await fn(figma);
  return { value: serialize(value) };
}

async function getTree(params: Record<string, any>) {
  const maxDepth = Number.isFinite(params.maxDepth) ? params.maxDepth : 6;
  const filter = params.filter ? new RegExp(params.filter) : null;
  if (!params.nodeId) await figma.loadAllPagesAsync();
  const root = params.nodeId ? await figma.getNodeByIdAsync(params.nodeId) : figma.root;
  if (!root) throw new Error(`no node ${params.nodeId}`);
  return summarize(root, 0, maxDepth, filter);
}

function summarize(node: BaseNode, depth: number, maxDepth: number, filter: RegExp | null): any {
  const out: any = { id: node.id, name: node.name, type: node.type };
  if (node.type === "TEXT") {
    const chars = (node as TextNode).characters;
    out.characters = chars.length > 120 ? chars.slice(0, 120) + "…" : chars;
  }
  if ("width" in node) {
    out.width = Math.round((node as any).width);
    out.height = Math.round((node as any).height);
  }
  if ("visible" in node && !(node as any).visible) out.visible = false;
  if ("children" in node) {
    if (depth < maxDepth) {
      out.children = node.children
        .filter((c) => !filter || filter.test(c.type))
        .map((c) => summarize(c, depth + 1, maxDepth, filter));
    } else {
      out.truncated = true;
      out.childCount = node.children.length;
    }
  }
  return out;
}

async function getNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`no node ${nodeId}`);
  const out: any = { id: node.id, name: node.name, type: node.type };
  const keys = [
    "fills", "strokes", "effects", "constraints", "layoutMode",
    "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing",
    "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
    "cornerRadius", "opacity", "visible", "characters", "fontSize",
    "fontName", "textAlignHorizontal", "textAlignVertical", "lineHeight", "letterSpacing",
  ];
  for (const key of keys) {
    try {
      const v = (node as any)[key];
      if (v !== undefined) out[key] = serialize(v);
    } catch {}
  }
  try {
    out.absoluteTransform = (node as any).absoluteTransform;
  } catch {}
  try {
    out.absoluteBoundingBox = (node as any).absoluteBoundingBox;
  } catch {}
  if ("children" in node) {
    out.children = node.children.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  }
  return out;
}

async function screenshot(params: Record<string, any>) {
  let node: PageNode | SceneNode = figma.currentPage;
  let note: string | null = null;
  if (params.nodeId) {
    const n = await figma.getNodeByIdAsync(params.nodeId);
    if (!n) throw new Error(`no node ${params.nodeId}`);
    node = n as SceneNode;
  } else if (params.viewport) {
    const nodes = figma.currentPage.children.filter((c) => c.visible);
    if (nodes.length === 0) throw new Error("page is empty");
    note = "viewport export approximated by rendering all top-level nodes";
  }
  const format = params.format === "jpg" ? "JPG" : "PNG";
  const bytes = await node.exportAsync({
    format,
    constraint: { type: "SCALE", value: params.scale ?? 1 },
  });
  return {
    data: arrayBufferToBase64(bytes),
    mimeType: format === "JPG" ? "image/jpeg" : "image/png",
    note,
  };
}

// ---------------------------------------------------------------------------
// Write surface
// ---------------------------------------------------------------------------

async function createFrame(params: Record<string, any>) {
  const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : figma.currentPage;
  if (!parent) throw new Error(`no node ${params.parentId}`);
  const frame = figma.createFrame();
  frame.name = params.name ?? "Frame";
  frame.resize(Number(params.width ?? 100), Number(params.height ?? 100));
  if (params.x !== undefined) frame.x = Number(params.x);
  if (params.y !== undefined) frame.y = Number(params.y);
  if (params.fills) frame.fills = params.fills;
  if (params.cornerRadius !== undefined) frame.cornerRadius = Number(params.cornerRadius);
  if (params.layoutMode) {
    frame.layoutMode = params.layoutMode;
    if (params.itemSpacing !== undefined) frame.itemSpacing = Number(params.itemSpacing);
    if (params.paddingLeft !== undefined) frame.paddingLeft = Number(params.paddingLeft);
    if (params.paddingRight !== undefined) frame.paddingRight = Number(params.paddingRight);
    if (params.paddingTop !== undefined) frame.paddingTop = Number(params.paddingTop);
    if (params.paddingBottom !== undefined) frame.paddingBottom = Number(params.paddingBottom);
    if (params.primaryAxisAlignItems) frame.primaryAxisAlignItems = params.primaryAxisAlignItems;
    if (params.counterAxisAlignItems) frame.counterAxisAlignItems = params.counterAxisAlignItems;
  }
  (parent as any).appendChild(frame);
  return { id: frame.id, name: frame.name };
}

async function createText(params: Record<string, any>) {
  const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : figma.currentPage;
  if (!parent) throw new Error(`no node ${params.parentId}`);
  const text = figma.createText();
  text.name = params.name ?? "Text";
  if (params.fontName) text.fontName = params.fontName;
  text.characters = String(params.characters ?? "");
  if (params.fontSize !== undefined) text.fontSize = Number(params.fontSize);
  if (params.fills) text.fills = params.fills;
  if (params.textAlignHorizontal) text.textAlignHorizontal = params.textAlignHorizontal;
  if (params.textAutoResize) text.textAutoResize = params.textAutoResize;
  if (params.width !== undefined && params.height !== undefined) {
    text.resize(Number(params.width), Number(params.height));
  }
  if (params.x !== undefined) text.x = Number(params.x);
  if (params.y !== undefined) text.y = Number(params.y);
  (parent as any).appendChild(text);
  return { id: text.id, name: text.name };
}

async function setProperties(params: Record<string, any>) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  const applied: string[] = [];
  for (const [key, value] of Object.entries(params.properties ?? {})) {
    (node as any)[key] = value;
    applied.push(key);
  }
  return { id: node.id, applied };
}

async function deleteNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`no node ${nodeId}`);
  const type = node.type;
  node.remove();
  return { removed: nodeId, type };
}

async function cloneNode(params: Record<string, any>) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  const copy = (node as SceneNode).clone();
  const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : node.parent;
  if (!parent) throw new Error(`no node ${params.parentId}`);
  (parent as any).appendChild(copy);
  if (params.x !== undefined) copy.x = Number(params.x);
  if (params.y !== undefined) copy.y = Number(params.y);
  return { id: copy.id, name: copy.name };
}

async function setImageFill(params: Record<string, any>) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  if (!("fills" in node)) throw new Error(`node ${params.nodeId} (${node.type}) has no fills`);
  const bytes = base64ToBytes(String(params.base64));
  const image = figma.createImage(bytes);
  const scaleMode = params.scaleMode ?? "FILL";
  (node as any).fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode }];
  return { id: node.id, imageHash: image.hash, scaleMode };
}

async function setEffects(params: Record<string, any>) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  (node as any).effects = params.effects;
  return { id: node.id, effects: serialize((node as any).effects) };
}

async function paint(params: Record<string, any>, prop: "fills" | "strokes") {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  (node as any)[prop] = params[prop];
  return { id: node.id, [prop]: serialize((node as any)[prop]) };
}

async function importComponent(params: Record<string, any>) {
  const key = params.componentKey;
  if (!key) throw new Error("componentKey is required");
  const component = await figma.importComponentByKeyAsync(key);
  const instance = component.createInstance();
  const parent = params.parentId ? await figma.getNodeByIdAsync(params.parentId) : figma.currentPage;
  if (!parent) throw new Error(`no node ${params.parentId}`);
  (parent as any).appendChild(instance);
  if (params.x !== undefined) instance.x = Number(params.x);
  if (params.y !== undefined) instance.y = Number(params.y);
  return { id: instance.id, name: instance.name, componentKey: key };
}

// ---------------------------------------------------------------------------
// Selection and export
// ---------------------------------------------------------------------------

function getSelection() {
  return {
    nodes: figma.currentPage.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
  };
}

async function setSelection(nodeIds: string[]) {
  const nodes: SceneNode[] = [];
  for (const id of nodeIds ?? []) {
    const n = await figma.getNodeByIdAsync(id);
    if (!n) throw new Error(`no node ${id}`);
    nodes.push(n as SceneNode);
  }
  figma.currentPage.selection = nodes;
  if (nodes.length > 0) {
    figma.viewport.scrollAndZoomIntoView(nodes);
  }
  return { selected: nodes.map((n) => n.id) };
}

async function exportNode(params: Record<string, any>) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`no node ${params.nodeId}`);
  const formatMap: Record<string, "PNG" | "JPG" | "SVG" | "PDF"> = {
    png: "PNG", jpg: "JPG", svg: "SVG", pdf: "PDF",
  };
  const format = formatMap[params.format] ?? "PNG";
  const settings: ExportSettings =
    format === "PNG" || format === "JPG"
      ? { format, constraint: { type: "SCALE", value: params.scale ?? 2 } }
      : { format };
  const bytes = await (node as SceneNode | PageNode).exportAsync(settings);
  return {
    data: arrayBufferToBase64(bytes),
    mimeType:
      format === "PNG"
        ? "image/png"
        : format === "JPG"
          ? "image/jpeg"
          : format === "SVG"
            ? "image/svg+xml"
            : "application/pdf",
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serialize(value: unknown, depth = 0): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const t = typeof value;
  if (t === "string" || t === "boolean" || t === "number") return value;
  if (Array.isArray(value)) {
    if (depth > 8) return "[...]";
    return value.map((v) => serialize(v, depth + 1));
  }
  if (t === "object") {
    if (depth > 8) return "{...}";
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object)) {
      try {
        out[k] = serialize((value as Record<string, unknown>)[k], depth + 1);
      } catch {
        out[k] = "<unserializable>";
      }
    }
    return out;
  }
  return String(value);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
