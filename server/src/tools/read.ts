/**
 * Read tools: orientation, structure, layout, search, screenshots, exports.
 */

import { z } from "zod";
import { callPlugin, exec, selectionCache } from "../relay-client";
import { defineTool, image, json, text, type Content } from "./registry";
import { SELECTION_CACHE_MS, wildcardToRegex } from "../util";

export const getBasicInfo = defineTool({
  description:
    "Get essential context about the current file in one cheap call: file name, every page, the top-level frames (artboards) of the current page with dimensions, font families in use, and local paint styles (design tokens). Call get_basic_info first to understand the canvas situation before any other tool.",
  schema: z.object({}),
  annotations: { readOnlyHint: true },
  run: () =>
    exec(`return (async () => {
  const file = figma.root;
  const page = figma.currentPage;
  const fonts = new Set();
  for (const n of page.findAll(n => n.type === "TEXT")) {
    try { fonts.add(n.fontName.family); } catch {}
  }
  return {
    fileName: file.name,
    pages: file.children.map(p => ({ id: p.id, name: p.name })),
    currentPage: { id: page.id, name: page.name },
    artboards: page.children.map(c => ({
      id: c.id, name: c.name, type: c.type,
      width: "width" in c ? c.width : null,
      height: "height" in c ? c.height : null,
      x: "x" in c ? c.x : null, y: "y" in c ? c.y : null,
    })),
    fonts: [...fonts],
    paintStyles: (await figma.getLocalPaintStylesAsync()).map(s => ({ name: s.name, id: s.id })),
  };
})()`).then(json),
});

export const findNodes = defineTool({
  description:
    "Find nodes across the current page by text content and/or computed styles, without walking the tree manually. text matches TEXT node content case-insensitively; * is a wildcard. color matches a hex fill like #ff0000 (solid fills only). filters matches computed styles: style_name is one of background-color, font-size, font-family, opacity, width, height, corner-radius; style_value is the literal value, or a paint-style token name like --accent for background-color, or * for any. All criteria AND together. Returns id, name, type, the bound token if the fill uses a paint style, and what matched. Use it before bulk updates: find first, then set_properties on the ids.",
  schema: z
    .object({
      text: z.string().optional().describe("Text content to match; * wildcard"),
      color: z.string().optional().describe("Hex fill color to match, e.g. #ff0000"),
      filters: z
        .array(
          z.object({
            style_name: z.enum([
              "background-color",
              "font-size",
              "font-family",
              "opacity",
              "width",
              "height",
              "corner-radius",
            ]),
            style_value: z
              .string()
              .describe("Literal value, token name (--accent), or * for any"),
          }),
        )
        .optional()
        .describe("Computed style filters, ANDed together"),
      page_id: z.string().optional().describe("Page to search; defaults to the current page"),
      limit: z.number().optional().describe("Max results, default 50"),
    })
    .refine(
      (a) => a.text || a.color || (a.filters?.length ?? 0) > 0,
      "pass text, color, filters, or a combination",
    ),
  annotations: { readOnlyHint: true },
  run: (args) => {
    const limit = args.limit ?? 50;
    const checks: string[] = [];
    const matched: string[] = [];
    const esc = (s: string) => JSON.stringify(s);
    const solidHex = (hex: string) =>
      `"fills" in n && Array.isArray(n.fills) && n.fills.some(f => f.type === "SOLID" && f.color && ((Math.round(f.color.r*255)<<16) | (Math.round(f.color.g*255)<<8) | Math.round(f.color.b*255)).toString(16).padStart(6,"0").startsWith(${esc(hex.slice(0, 6))}))`;

    if (args.text) {
      const re = wildcardToRegex(args.text).source;
      checks.push(`n.type === "TEXT" && /${re}/.test(n.characters)`);
      matched.push(`{ textValue: ${esc(args.text)} }`);
    }
    if (args.color) {
      checks.push(solidHex(args.color.replace("#", "").toLowerCase()));
      matched.push(`{ styleName: "background-color", styleValue: ${esc(args.color)} }`);
    }
    for (const f of args.filters ?? []) {
      const { style_name: name, style_value: value } = f;
      if (value === "*") continue;
      if (name === "background-color") {
        checks.push(
          value.startsWith("--")
            ? `"fills" in n && Array.isArray(n.fills) && n.fills.some(f => f.styleId && styleNames[f.styleId] && styleNames[f.styleId].split("/").pop() === ${esc(value.replace(/^--/, ""))})`
            : solidHex(value.replace("#", "").toLowerCase()),
        );
      } else if (name === "font-size") {
        checks.push(`n.type === "TEXT" && typeof n.fontSize === "number" && Math.abs(n.fontSize - ${Number(value)}) < 0.01`);
      } else if (name === "font-family") {
        checks.push(`n.type === "TEXT" && n.fontName && typeof n.fontName === "object" && n.fontName.family === ${esc(value)}`);
      } else if (name === "opacity") {
        checks.push(`"opacity" in n && Math.abs(n.opacity - ${Number(value)}) < 0.01`);
      } else if (name === "width") {
        checks.push(`"width" in n && Math.abs(n.width - ${Number(value)}) < 0.01`);
      } else if (name === "height") {
        checks.push(`"height" in n && Math.abs(n.height - ${Number(value)}) < 0.01`);
      } else {
        checks.push(`"cornerRadius" in n && typeof n.cornerRadius === "number" && Math.abs(n.cornerRadius - ${Number(value)}) < 0.01`);
      }
      matched.push(`{ styleName: ${esc(name)}, styleValue: ${esc(value)} }`);
    }

    const page = args.page_id
      ? `await figma.getNodeByIdAsync(${JSON.stringify(args.page_id)})`
      : "figma.currentPage";
    return exec(`return (async () => {
  const styleNames = {};
  for (const s of (await figma.getLocalPaintStylesAsync())) styleNames[s.id] = s.name;
  const page = ${page};
  if (!page) throw new Error("page not found");
  const out = [];
  for (const n of page.findAll(n => ${checks.join(" && ")})) {
    const entry = { id: n.id, name: n.name, type: n.type };
    try {
      if ("fills" in n && Array.isArray(n.fills)) {
        const bound = n.fills.find(f => f.styleId && styleNames[f.styleId]);
        if (bound) entry.token = styleNames[bound.styleId];
      }
    } catch {}
    out.push(entry);
    if (out.length >= ${limit}) break;
  }
  return { matches: out, page: page.name, matched: [${matched.join(", ")}] };
})()`).then(json);
  },
});

export const getGuide = defineTool({
  description:
    "Read the usage guide for this server: the recommended workflow (get_basic_info to orient, get_layout before moving things, get_screenshot to verify, find_nodes before bulk edits) and per-tool notes. Call it once before heavy use.",
  schema: z.object({
    topic: z
      .enum(["figma-bridge-instructions"])
      .optional()
      .describe('Only "figma-bridge-instructions" for now'),
  }),
  annotations: { readOnlyHint: true },
  run: () =>
    Promise.resolve(
      text(
        [
          "figma-bridge workflow:",
          "1. get_basic_info — orient: file, pages, artboards, fonts, paint styles.",
          "2. get_tree / get_node — structure and detail for a subtree or node.",
          "3. get_layout — 2D map of a frame before moving or aligning anything; call again after.",
          "4. find_nodes — locate every node matching text, a fill color, or computed styles (font size, family, opacity, dimensions, corner radius, paint-style tokens) before bulk edits.",
          "5. Mutate with create_frame / create_text / set_properties / set_fills / set_strokes / set_effects / set_image_fill / clone_node / delete_node.",
          "6. get_screenshot — verify visually after every mutation batch.",
          "7. notify — toast the human when a step completes.",
          "Notes:",
          "- execute runs arbitrary Plugin API code; prefer the named tools, fall back to execute for anything they miss.",
          "- Fonts must be loaded before use: await figma.loadFontAsync({family, style}) inside execute.",
          "- set_selection scrolls the human to the nodes you are editing.",
        ].join("\n"),
      ),
    ),
});

export const execute = defineTool({
  description:
    "Run arbitrary Figma Plugin API code inside the Figma desktop app. `figma` is in scope. The value of the last expression is returned as JSON. Prefer the named tools (get_basic_info, get_tree, find_nodes, get_layout) for reading; use execute for what they miss. Read before you mutate, get_screenshot after, then notify so the human sees a toast.",
  schema: z.object({ code: z.string().describe("Plugin API code to run") }),
  run: (args) => exec(args.code).then(json),
});

export const getTree = defineTool({
  description:
    "Read the document node tree: ids, names, types, layout, text content (truncated), and sizes. Cheaper than execute for orientation. Returns the subtree under node_id (default: document root), capped by max_depth.",
  schema: z.object({
    node_id: z.string().optional().describe("Subtree root; omit for the whole document"),
    max_depth: z.number().optional().describe("Depth cap, default 6"),
    filter: z.string().optional().describe("Regex; only node types matching it are expanded"),
  }),
  run: (args) =>
    callPlugin("get_tree", {
      nodeId: args.node_id,
      maxDepth: args.max_depth,
      filter: args.filter,
    }).then(json),
});

export const getTreeSummary = defineTool({
  description:
    "Compact indented text summary of a node's subtree: one line per node with type, name, id, and dimensions. Much cheaper than get_tree or get_jsx for understanding structure. Use it to orient before diving into specific nodes. Depth defaults to 3, max 10; nodes past the depth show a child-count hint.",
  schema: z.object({
    node_id: z.string().optional().describe("Subtree root; omit for the current page"),
    depth: z.number().optional().describe("Max depth, default 3, max 10"),
  }),
  annotations: { readOnlyHint: true },
  run: (args) => {
    const id = args.node_id ? JSON.stringify(args.node_id) : "null";
    const depth = Math.min(args.depth ?? 3, 10);
    return exec(`return (async () => {
  const root = ${id} ? await figma.getNodeByIdAsync(${id}) : figma.currentPage;
  if (!root) throw new Error("node not found");
  const max = ${depth};
  const out = [];
  function walk(n, d, pad) {
    const size = ("width" in n && "height" in n) ? Math.round(n.width) + "x" + Math.round(n.height) : "?";
    out.push(pad + n.type + " " + JSON.stringify(n.name) + " " + n.id + " " + size);
    if ("children" in n) {
      if (d >= max) { if (n.children.length) out.push(pad + "  ... " + n.children.length + " children"); return; }
      for (const c of n.children) walk(c, d + 1, pad + "  ");
    }
  }
  walk(root, 0, "");
  return { summary: out.join("\\n"), lines: out.length };
})()`).then(json);
  },
});

export const getNode = defineTool({
  description:
    "Full detail for one node: fills, strokes, effects, text style, constraints, absolute transform, children ids.",
  schema: z.object({ node_id: z.string() }),
  annotations: { readOnlyHint: true },
  run: (args) => callPlugin("get_node", { nodeId: args.node_id }).then(json),
});

export const getLayout = defineTool({
  description:
    "A 2D map of one frame for placing and aligning things. Returns a wireframe image (every child outlined and labelled with id, position and size over a faded screenshot, shared columns as dashed guides, problems in red), an ASCII grid with px rulers, the x positions children share, and issues: overflow past the frame, overlapping nodes, and edges that almost line up with a column. Read it before moving nodes, and again after.",
  schema: z.object({
    node_id: z.string().describe("The frame to map"),
    cell: z.number().optional().describe("Pixels per character, default 10"),
    tolerance: z.number().optional().describe("Edges within this many px count as aligned, default 2"),
    max_depth: z.number().optional().describe("How deep to open groups and frames, default 4"),
    render: z.boolean().optional().describe("false skips the wireframe image"),
  }),
  annotations: { readOnlyHint: true },
  run: (args) =>
    callPlugin("get_layout", {
      nodeId: args.node_id,
      cell: args.cell,
      tolerance: args.tolerance,
      maxDepth: args.max_depth,
      render: args.render,
    }).then((r: any) => {
      const { map, image: img, ...rest } = r;
      const c: Content[] = [];
      if (img) c.push(image(img.data, img.mimeType));
      c.push(...text(`${map}\n\n${JSON.stringify(rest, null, 2)}`));
      return c;
    }),
});

export const getScreenshot = defineTool({
  description:
    "Render the canvas (or one node) to an image and return it. This is how you see your work.",
  schema: z.object({
    viewport: z.boolean().optional().describe("true: current viewport; false: whole page"),
    node_id: z.string().optional().describe("Render this node instead"),
    format: z.enum(["png", "jpg"]).optional(),
    scale: z.number().optional().describe("Export scale, default 1"),
  }),
  annotations: { readOnlyHint: true },
  run: (args) =>
    callPlugin("get_screenshot", {
      viewport: args.viewport,
      nodeId: args.node_id,
      format: args.format ?? "png",
      scale: args.scale ?? 1,
    }).then((r: any) => {
      const c: Content[] = [image(r.data, r.mimeType)];
      if (r.note) c.push(...text(r.note));
      return c;
    }),
});

export const getSelection = defineTool({
  description:
    "What the human has selected in Figma right now. The plugin pushes selection changes continuously, so this is usually instant from cache.",
  schema: z.object({}),
  annotations: { readOnlyHint: true },
  run: () => {
    const cached = selectionCache();
    if (cached && Date.now() - cached.at < SELECTION_CACHE_MS) {
      return Promise.resolve(text(JSON.stringify({ nodes: cached.nodes, source: "push" }, null, 2)));
    }
    return callPlugin("get_selection", {}).then(json);
  },
});

export const getComputedStyles = defineTool({
  description:
    "Get computed styles for one or more nodes in one call: fills and strokes as hex (or paint type for non-solid), font family/size/style for text, cornerRadius, opacity. Returns a map of nodeId to styles. Use it to read exact values before a bulk find_nodes or set_properties.",
  schema: z.object({ node_ids: z.array(z.string()).describe("Node IDs to read") }),
  annotations: { readOnlyHint: true },
  run: (args) =>
    exec(`return (async () => {
  const hex = (c) => "#" + ((Math.round(c.r*255)<<16) | (Math.round(c.g*255)<<8) | Math.round(c.b*255)).toString(16).padStart(6, "0");
  const paint = (f) => f.type === "SOLID" && f.color ? hex(f.color) : f.type;
  const out = {};
  for (const id of ${JSON.stringify(args.node_ids)}) {
    const n = await figma.getNodeByIdAsync(id);
    if (!n) { out[id] = null; continue; }
    const s = {};
    try { if ("fills" in n && Array.isArray(n.fills)) s.fills = n.fills.filter(f => f.visible !== false).map(paint); } catch {}
    try { if ("strokes" in n && Array.isArray(n.strokes)) s.strokes = n.strokes.map(paint); } catch {}
    try { if (n.type === "TEXT" && typeof n.fontSize === "number") { s.fontSize = n.fontSize; s.fontFamily = n.fontName.family; s.fontStyle = n.fontName.style; } } catch {}
    try { if ("cornerRadius" in n && typeof n.cornerRadius === "number") s.cornerRadius = n.cornerRadius; } catch {}
    try { if ("opacity" in n) s.opacity = n.opacity; } catch {}
    out[id] = s;
  }
  return out;
})()`).then(json),
});

export const getFillImage = defineTool({
  description:
    "Extract the image data from a node that has an image fill. Returns base64 image bytes. Errors if the node has no image fill; use get_screenshot for those.",
  schema: z.object({ node_id: z.string() }),
  annotations: { readOnlyHint: true },
  run: (args) =>
    exec(`return (async () => {
  const n = await figma.getNodeByIdAsync(${JSON.stringify(args.node_id)});
  if (!n) throw new Error("node not found");
  const fill = "fills" in n && Array.isArray(n.fills) ? n.fills.find(f => f.type === "IMAGE" && f.visible !== false) : null;
  if (!fill) throw new Error("node has no image fill");
  const img = figma.getImageByHash(fill.imageHash);
  const bytes = await img.getBytesAsync();
  const b64 = await figma.base64Encode(bytes);
  return { data: b64, mimeType: img.getMimeTypeAsync ? await img.getMimeTypeAsync() : "image/png", size: bytes.length };
})()`).then((r: any) => [
    image(r.data, r.mimeType ?? "image/png"),
    ...text(`size: ${r.size} bytes`),
  ]),
});

export const exportNode = defineTool({
  description:
    "Export one node as png/jpg/svg/pdf and return the bytes (base64 for png/jpg, text for svg).",
  schema: z.object({
    node_id: z.string(),
    format: z.enum(["png", "jpg", "svg", "pdf"]).optional(),
    scale: z.number().optional().describe("Raster scale, default 2"),
  }),
  annotations: { readOnlyHint: true },
  run: (args) =>
    callPlugin("export_node", {
      nodeId: args.node_id,
      format: args.format ?? "png",
      scale: args.scale,
    }).then((r: any) => {
      if (r.mimeType === "image/svg+xml") {
        return text(Buffer.from(r.data, "base64").toString("utf8"));
      }
      return [image(r.data, r.mimeType)];
    }),
});

export const readTools = {
  get_basic_info: getBasicInfo,
  find_nodes: findNodes,
  get_guide: getGuide,
  execute,
  get_tree: getTree,
  get_tree_summary: getTreeSummary,
  get_node: getNode,
  get_layout: getLayout,
  get_screenshot: getScreenshot,
  get_selection: getSelection,
  get_computed_styles: getComputedStyles,
  get_fill_image: getFillImage,
  export_node: exportNode,
};
