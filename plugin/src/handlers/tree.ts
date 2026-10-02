import { z } from "./schema";
import * as R from "remeda";
import { method, requireNode } from "./protocol";
import { serialize } from "./serialize";

const TEXT_PREVIEW = 120;

const preview = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

export const getTree = method(
  z.object({
    nodeId: z.string().optional(),
    maxDepth: z.number().int().min(0).default(6),
    filter: z.string().optional(),
  }),
  async ({ nodeId, maxDepth, filter }) => {
    const re = filter ? new RegExp(filter) : null;
    if (!nodeId) await figma.loadAllPagesAsync();
    const root = nodeId ? await requireNode(nodeId) : figma.root;
    return summarize(root, 0, maxDepth, re);
  },
);

function summarize(node: BaseNode, depth: number, maxDepth: number, filter: RegExp | null): unknown {
  const out: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };
  if (node.type === "TEXT") {
    const chars = (node as TextNode).characters;
    out.characters = preview(chars, TEXT_PREVIEW);
  }
  if ("width" in node) {
    out.width = R.round((node as SceneNode).width, 0);
    out.height = R.round((node as SceneNode).height, 0);
  }
  if ("visible" in node && !node.visible) out.visible = false;
  if ("children" in node) {
    if (depth < maxDepth) {
      const kids = filter ? node.children.filter((c) => filter.test(c.type)) : node.children;
      out.children = kids.map((c) => summarize(c, depth + 1, maxDepth, filter));
    } else {
      out.truncated = true;
      out.childCount = node.children.length;
    }
  }
  return out;
}

const NODE_KEYS = [
  "fills", "strokes", "effects", "constraints", "layoutMode",
  "primaryAxisAlignItems", "counterAxisAlignItems", "itemSpacing",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "cornerRadius", "opacity", "visible", "characters", "fontSize",
  "fontName", "textAlignHorizontal", "textAlignVertical", "lineHeight", "letterSpacing",
] as const;

export const getNode = method(z.object({ nodeId: z.string() }), async ({ nodeId }) => {
  const node = await requireNode(nodeId);
  const out: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };
  const rec = node as unknown as Record<string, unknown>;
  for (const key of NODE_KEYS) {
    try {
      if (rec[key] !== undefined) out[key] = serialize(rec[key]);
    } catch {}
  }
  for (const key of ["absoluteTransform", "absoluteBoundingBox"] as const) {
    try {
      out[key] = rec[key];
    } catch {}
  }
  if ("children" in node) {
    out.children = node.children.map((c) => ({ id: c.id, name: c.name, type: c.type }));
  }
  return out;
});