/**
 * Page management tools.
 */

import { z } from "zod";
import { exec } from "../relay-client";
import { defineTool, json } from "./registry";

export const createPage = defineTool({
  description:
    "Create a new page in the file. Returns the new page's id and name. Use get_basic_info to list existing pages.",
  schema: z.object({ name: z.string().optional().describe('Display name; defaults to "Page N"') }),
  annotations: { destructiveHint: true },
  run: (args) =>
    exec(`return (async () => {
  const p = figma.createPage();
  ${args.name ? `p.name = ${JSON.stringify(args.name)};` : ""}
  return { id: p.id, name: p.name };
})()`).then(json),
});

export const renamePages = defineTool({
  description:
    "Rename one or more pages in a single call. Does not switch which page the user is viewing.",
  schema: z.object({
    updates: z.array(z.object({ page_id: z.string(), name: z.string() })),
  }),
  annotations: { destructiveHint: true },
  run: (args) =>
    exec(`return (async () => {
  const out = [];
  for (const u of ${JSON.stringify(args.updates.map((u) => ({ id: u.page_id, name: u.name })))}) {
    const p = await figma.getNodeByIdAsync(u.id);
    if (!p || p.type !== "PAGE") { out.push({ id: u.id, error: "not a page" }); continue; }
    p.name = u.name;
    out.push({ id: u.id, name: p.name });
  }
  return out;
})()`).then(json),
});

export const pageTools = { create_page: createPage, rename_pages: renamePages };