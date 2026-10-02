import { z } from "./schema";
import { method, requireNode } from "./protocol";
import { serialize, bytesToBase64, base64ToBytes, MIME_BY_FORMAT } from "./serialize";

const parentOf = async (parentId?: string) => {
  if (!parentId) return figma.currentPage;
  return requireNode<SceneNode & { appendChild: (n: BaseNode) => void }>(parentId);
};

const xy = (params: { x?: number; y?: number }, node: { x: number; y: number }) => {
  if (params.x !== undefined) node.x = params.x;
  if (params.y !== undefined) node.y = params.y;
};

export const createFrame = method(
  z.object({
    parentId: z.string().optional(),
    name: z.string().optional(),
    width: z.number().default(100),
    height: z.number().default(100),
    x: z.number().optional(),
    y: z.number().optional(),
    fills: z.any().optional(),
    cornerRadius: z.number().optional(),
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    itemSpacing: z.number().optional(),
    paddingLeft: z.number().optional(),
    paddingRight: z.number().optional(),
    paddingTop: z.number().optional(),
    paddingBottom: z.number().optional(),
    primaryAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"]).optional(),
    counterAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "BASELINE"]).optional(),
  }),
  async (p) => {
    const parent = await parentOf(p.parentId);
    const frame = figma.createFrame();
    frame.name = p.name ?? "Frame";
    frame.resize(p.width, p.height);
    xy(p, frame);
    if (p.fills) frame.fills = p.fills;
    if (p.cornerRadius !== undefined) frame.cornerRadius = p.cornerRadius;
    if (p.layoutMode && p.layoutMode !== "NONE") {
      frame.layoutMode = p.layoutMode;
      for (const [key, value] of Object.entries(p) as [string, number | string | undefined][]) {
        if (value === undefined || !["itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "primaryAxisAlignItems", "counterAxisAlignItems"].includes(key)) continue;
        (frame as unknown as Record<string, unknown>)[key] = value;
      }
    }
    parent.appendChild(frame);
    return { id: frame.id, name: frame.name };
  },
);

export const createText = method(
  z.object({
    parentId: z.string().optional(),
    name: z.string().optional(),
    fontName: z.object({ family: z.string(), style: z.string() }).optional(),
    characters: z.string().default(""),
    fontSize: z.number().optional(),
    fills: z.any().optional(),
    textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional(),
    textAutoResize: z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  async (p) => {
    const parent = await parentOf(p.parentId);
    const text = figma.createText();
    text.name = p.name ?? "Text";
    if (p.fontName) text.fontName = p.fontName;
    text.characters = p.characters;
    if (p.fontSize !== undefined) text.fontSize = p.fontSize;
    if (p.fills) text.fills = p.fills;
    if (p.textAlignHorizontal) text.textAlignHorizontal = p.textAlignHorizontal;
    if (p.textAutoResize) text.textAutoResize = p.textAutoResize;
    if (p.width !== undefined && p.height !== undefined) text.resize(p.width, p.height);
    xy(p, text);
    parent.appendChild(text);
    return { id: text.id, name: text.name };
  },
);

export const setProperties = method(
  z.object({ nodeId: z.string(), properties: z.record(z.any()) }),
  async ({ nodeId, properties }) => {
    const node = await requireNode(nodeId);
    const applied = Object.keys(properties);
    for (const [key, value] of Object.entries(properties)) {
      (node as unknown as Record<string, unknown>)[key] = value;
    }
    return { id: node.id, applied };
  },
);

export const deleteNode = method(z.object({ nodeId: z.string() }), async ({ nodeId }) => {
  const node = await requireNode(nodeId);
  const type = node.type;
  node.remove();
  return { removed: nodeId, type };
});

export const cloneNode = method(
  z.object({ nodeId: z.string(), parentId: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  async ({ nodeId, parentId, ...pos }) => {
    const node = await requireNode<SceneNode>(nodeId);
    const copy = node.clone();
    const parent = parentId ? await parentOf(parentId) : node.parent;
    if (!parent) throw new Error(`no node ${parentId}`);
    (parent as SceneNode & { appendChild: (n: BaseNode) => void }).appendChild(copy);
    xy(pos, copy);
    return { id: copy.id, name: copy.name };
  },
);

export const setImageFill = method(
  z.object({ nodeId: z.string(), base64: z.string(), scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).default("FILL") }),
  async ({ nodeId, base64, scaleMode }) => {
    const node = await requireNode(nodeId);
    if (!("fills" in node)) throw new Error(`node ${nodeId} (${node.type}) has no fills`);
    const image = figma.createImage(base64ToBytes(base64));
    (node as unknown as { fills: Paint[] }).fills = [
      { type: "IMAGE", imageHash: image.hash, scaleMode },
    ];
    return { id: node.id, imageHash: image.hash, scaleMode };
  },
);

export const setEffects = method(
  z.object({ nodeId: z.string(), effects: z.array(z.any()) }),
  async ({ nodeId, effects }) => {
    const node = await requireNode(nodeId);
    (node as unknown as { effects: Effect[] }).effects = effects;
    return { id: node.id, effects: serialize((node as unknown as { effects: Effect[] }).effects) };
  },
);

const paint = (prop: "fills" | "strokes") =>
  method(
    z.object({
      nodeId: z.string(),
      fills: z.array(z.any()).optional(),
      strokes: z.array(z.any()).optional(),
    }),
    async ({ nodeId, fills, strokes }) => {
      const value = (prop === "fills" ? fills : strokes) ?? [];
      const node = await requireNode(nodeId);
      (node as unknown as Record<string, Paint[]>)[prop] = value;
      return { id: node.id, [prop]: serialize((node as unknown as Record<string, Paint[]>)[prop]) };
    },
  );

export const setFills = paint("fills");
export const setStrokes = paint("strokes");

export const importComponent = method(
  z.object({ componentKey: z.string(), parentId: z.string().optional(), x: z.number().optional(), y: z.number().optional() }),
  async ({ componentKey, parentId, ...pos }) => {
    const component = await figma.importComponentByKeyAsync(componentKey);
    const instance = component.createInstance();
    const parent = await parentOf(parentId);
    parent.appendChild(instance);
    xy(pos, instance);
    return { id: instance.id, name: instance.name, componentKey };
  },
);

export const getSelection = method(z.object({}), () => ({
  nodes: figma.currentPage.selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
}));

export const setSelection = method(
  z.object({ nodeIds: z.array(z.string()) }),
  async ({ nodeIds }) => {
    const nodes: SceneNode[] = [];
    for (const id of nodeIds) nodes.push(await requireNode<SceneNode>(id));
    figma.currentPage.selection = nodes;
    if (nodes.length > 0) figma.viewport.scrollAndZoomIntoView(nodes);
    return { selected: nodes.map((n) => n.id) };
  },
);

export const screenshot = method(
  z.object({
    nodeId: z.string().optional(),
    viewport: z.boolean().optional(),
    format: z.enum(["png", "jpg"]).default("png"),
    scale: z.number().positive().default(1),
  }),
  async ({ nodeId, viewport, format, scale }) => {
    let node: PageNode | SceneNode = figma.currentPage;
    let note: string | null = null;
    if (nodeId) {
      node = await requireNode<SceneNode>(nodeId);
    } else if (viewport) {
      if (figma.currentPage.children.filter((c) => c.visible).length === 0) throw new Error("page is empty");
      note = "viewport export approximated by rendering all top-level nodes";
    }
    const figFormat = format.toUpperCase() as "PNG" | "JPG";
    const bytes = await node.exportAsync({ format: figFormat, constraint: { type: "SCALE", value: scale } });
    return { data: bytesToBase64(bytes), mimeType: MIME_BY_FORMAT[figFormat], note };
  },
);

const EXPORT_FORMATS = ["png", "jpg", "svg", "pdf"] as const;

export const exportNode = method(
  z.object({
    nodeId: z.string(),
    format: z.enum(EXPORT_FORMATS).default("png"),
    scale: z.number().positive().default(2),
  }),
  async ({ nodeId, format, scale }) => {
    const node = await requireNode<SceneNode | PageNode>(nodeId);
    const figFormat = format.toUpperCase() as "PNG" | "JPG" | "SVG" | "PDF";
    const settings: ExportSettings =
      figFormat === "PNG" || figFormat === "JPG"
        ? { format: figFormat, constraint: { type: "SCALE", value: scale } }
        : { format: figFormat };
    const bytes = await node.exportAsync(settings);
    return { data: bytesToBase64(bytes), mimeType: MIME_BY_FORMAT[figFormat] };
  },
);

export const notify = method(z.object({ message: z.string() }), ({ message }) => {
  figma.notify(message);
  return null;
});

export const ping = method(z.object({}), () => ({
  file: figma.root.name,
  page: figma.currentPage.name,
}));

export const execute = method(z.object({ code: z.string() }), async ({ code }) => {
  const fn = new Function("figma", `"use strict";\nreturn (async () => {\n${code}\n})();`);
  return { value: serialize(await fn(figma)) };
});

