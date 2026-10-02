/**
 * Mutation tools: create, style, clone, delete, selection, notifications.
 */

import { z } from "zod";
import { callPlugin } from "../relay-client";
import { defineTool, json, text } from "./registry";

const paint = z.any().describe("Figma Paint object");

export const notify = defineTool({
  description:
    "Show a toast inside Figma (figma.notify) so the human sees what the agent did.",
  schema: z.object({ message: z.string() }),
  run: (args) =>
    callPlugin("notify", { message: args.message }).then(() => text("ok")),
});

export const createFrame = defineTool({
  description:
    "Create a frame. Parent defaults to the current page. Pass layoutMode (HORIZONTAL/VERTICAL/NONE) plus itemSpacing and padding for auto-layout.",
  schema: z.object({
    parent_id: z.string().optional(),
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fills: z.array(paint).optional(),
    corner_radius: z.number().optional(),
    layout_mode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    item_spacing: z.number().optional(),
    padding_left: z.number().optional(),
    padding_right: z.number().optional(),
    padding_top: z.number().optional(),
    padding_bottom: z.number().optional(),
    primary_axis_align_items: z.string().optional(),
    counter_axis_align_items: z.string().optional(),
  }),
  run: (args) =>
    callPlugin("create_frame", {
      parentId: args.parent_id,
      name: args.name,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      fills: args.fills,
      cornerRadius: args.corner_radius,
      layoutMode: args.layout_mode,
      itemSpacing: args.item_spacing,
      paddingLeft: args.padding_left,
      paddingRight: args.padding_right,
      paddingTop: args.padding_top,
      paddingBottom: args.padding_bottom,
      primaryAxisAlignItems: args.primary_axis_align_items,
      counterAxisAlignItems: args.counter_axis_align_items,
    }).then(json),
});

export const createText = defineTool({
  description:
    "Create a text node. fontName is {family, style}; load the font first via execute if it is not Inter Regular.",
  schema: z.object({
    parent_id: z.string().optional(),
    name: z.string().optional(),
    characters: z.string().optional(),
    font_name: z.object({ family: z.string(), style: z.string() }).optional(),
    font_size: z.number().optional(),
    fills: z.array(paint).optional(),
    text_align_horizontal: z.string().optional(),
    text_auto_resize: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  run: (args) =>
    callPlugin("create_text", {
      parentId: args.parent_id,
      name: args.name,
      characters: args.characters,
      fontName: args.font_name,
      fontSize: args.font_size,
      fills: args.fills,
      textAlignHorizontal: args.text_align_horizontal,
      textAutoResize: args.text_auto_resize,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
    }).then(json),
});

export const setProperties = defineTool({
  description:
    'Set any writable Plugin API properties on a node in one call: {"cornerRadius": 8, "opacity": 0.5, ...}. Unknown keys throw the API\'s own error.',
  schema: z.object({
    node_id: z.string(),
    properties: z
      .record(z.string(), z.any())
      .describe("key/value map of Plugin API properties"),
  }),
  run: (args) =>
    callPlugin("set_properties", {
      nodeId: args.node_id,
      properties: args.properties,
    }).then(json),
});

export const deleteNode = defineTool({
  description: "Remove a node from the document.",
  schema: z.object({ node_id: z.string() }),
  annotations: { destructiveHint: true },
  run: (args) => callPlugin("delete_node", { nodeId: args.node_id }).then(json),
});

export const cloneNode = defineTool({
  description:
    "Duplicate a node, optionally into a different parent and position.",
  schema: z.object({
    node_id: z.string(),
    parent_id: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run: (args) =>
    callPlugin("clone_node", {
      nodeId: args.node_id,
      parentId: args.parent_id,
      x: args.x,
      y: args.y,
    }).then(json),
});

export const setFills = defineTool({
  description: "Replace a node's fills with Figma Paint objects.",
  schema: z.object({ node_id: z.string(), fills: z.array(paint) }),
  run: (args) =>
    callPlugin("set_fills", { nodeId: args.node_id, fills: args.fills }).then(
      json,
    ),
});

export const setStrokes = defineTool({
  description: "Replace a node's strokes with Figma Paint objects.",
  schema: z.object({ node_id: z.string(), strokes: z.array(paint) }),
  run: (args) =>
    callPlugin("set_strokes", {
      nodeId: args.node_id,
      strokes: args.strokes,
    }).then(json),
});

export const setEffects = defineTool({
  description:
    "Replace a node's effects (shadows, blurs) with Figma Effect objects.",
  schema: z.object({ node_id: z.string(), effects: z.array(z.any()) }),
  run: (args) =>
    callPlugin("set_effects", {
      nodeId: args.node_id,
      effects: args.effects,
    }).then(json),
});

export const importComponent = defineTool({
  description:
    "Instantiate a team library component by its component key (from the component's share link or get_node on an instance).",
  schema: z.object({
    component_key: z.string(),
    parent_id: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  run: (args) =>
    callPlugin("import_component", {
      componentKey: args.component_key,
      parentId: args.parent_id,
      x: args.x,
      y: args.y,
    }).then(json),
});

export const setImageFill = defineTool({
  description:
    "Set a node's fill to an image: pass image_url (fetched by the relay) or image_base64. This is how a placeholder rectangle becomes a real screenshot. scale_mode defaults to FILL.",
  schema: z.object({
    node_id: z.string(),
    image_url: z.string().optional().describe("URL to fetch the image from"),
    image_base64: z.string().optional().describe("Raw image bytes, base64"),
    scale_mode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional(),
  }),
  run: async (args) => {
    let base64 = args.image_base64;
    if (!base64 && args.image_url) {
      const res = await fetch(args.image_url);
      if (!res.ok)
        throw new Error(`image fetch failed: ${res.status} ${res.statusText}`);
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    }
    if (!base64) throw new Error("pass image_url or image_base64");
    return callPlugin("set_image_fill", {
      nodeId: args.node_id,
      base64,
      scaleMode: args.scale_mode ?? "FILL",
    }).then(json);
  },
});

export const setSelection = defineTool({
  description:
    "Select nodes in the Figma editor and scroll the viewport to them, so the human sees where you are working.",
  schema: z.object({ node_ids: z.array(z.string()) }),
  run: (args) =>
    callPlugin("set_selection", { nodeIds: args.node_ids }).then(json),
});

export const mutateTools = {
  notify,
  create_frame: createFrame,
  create_text: createText,
  set_properties: setProperties,
  delete_node: deleteNode,
  clone_node: cloneNode,
  set_fills: setFills,
  set_strokes: setStrokes,
  set_effects: setEffects,
  import_component: importComponent,
  set_image_fill: setImageFill,
  set_selection: setSelection,
};
