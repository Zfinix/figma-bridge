import { z } from "./schema";
import * as R from "remeda";
import { method, requireNode } from "./protocol";
import { bytesToBase64 } from "./serialize";

interface LayoutBox {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
}

interface Cluster {
  at: number;
  count: number;
}

interface Issues {
  overflow: { id: string; name: string; right: number; bottom: number }[];
  overlaps: { a: string; b: string; contained: boolean }[];
  nearMiss: { id: string; name: string; edge: string; at: number; column: number }[];
}

const NAME_PREVIEW = 40;

const preview = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const MAX_OVERLAPS = 50;
const NEAR_MISS_WINDOW = 8;

export const getLayout = method(
  z.object({
    nodeId: z.string(),
    cell: z.number().positive().default(10),
    tolerance: z.number().default(2),
    maxDepth: z.number().int().min(0).default(4),
    render: z.boolean().default(true),
  }),
  async ({ nodeId, cell, tolerance: tol, maxDepth, render }) => {
    const node = await requireNode<SceneNode>(nodeId);
    if (!("absoluteBoundingBox" in node)) throw new Error(`no frame ${nodeId}`);
    const origin = node.absoluteBoundingBox;
    if (!origin) throw new Error(`node ${nodeId} has no bounds`);

    const boxes: LayoutBox[] = [];
    collectBoxes(node, origin, boxes, 0, maxDepth);

    const cols = Math.ceil(origin.width / cell);
    const rows = Math.ceil(origin.height / cell);
    const map = renderMap(boxes, { cols, rows, cell });

    const columns = cluster(boxes.map((b) => b.x), tol);
    const rightEdges = cluster(boxes.map((b) => b.x + b.w), tol);
    const issues = findIssues(boxes, origin, columns, rightEdges, tol);
    const image = render ? await renderLayout(node, boxes, columns, rightEdges, issues) : null;

    return {
      id: node.id,
      name: node.name,
      width: R.round(origin.width, 1),
      height: R.round(origin.height, 1),
      cell,
      legend: "T text, I image, R shape, L line, G group, # overlap",
      map,
      image,
      columns,
      rightEdges,
      issues,
      nodes: boxes.map(({ id, name, kind, x, y, w, h, fontSize }) => ({
        id, name, kind,
        x: R.round(x, 1), y: R.round(y, 1), w: R.round(w, 1), h: R.round(h, 1),
        fontSize,
      })),
    };
  },
);

function collectBoxes(node: SceneNode, origin: Rect, out: LayoutBox[], depth: number, maxDepth: number) {
  if (!("children" in node)) return;
  for (const child of node.children) {
    if (!child.visible) continue;
    const bb = child.absoluteBoundingBox;
    if (!bb) continue;
    const kind = boxKind(child);
    if (kind === null && depth < maxDepth) {
      collectBoxes(child, origin, out, depth + 1, maxDepth);
      continue;
    }
    const box: LayoutBox = {
      id: child.id,
      name: preview(child.name, NAME_PREVIEW),
      kind: kind ?? "G",
      x: bb.x - origin.x,
      y: bb.y - origin.y,
      w: bb.width,
      h: bb.height,
    };
    if (child.type === "TEXT" && typeof child.fontSize === "number") box.fontSize = child.fontSize;
    out.push(box);
  }
}

function boxKind(node: SceneNode): string | null {
  if (node.type === "TEXT") return "T";
  if (node.type === "LINE") return "L";
  const fills = "fills" in node ? node.fills : null;
  if (Array.isArray(fills) && fills.some((f) => f.type === "IMAGE" && f.visible !== false)) return "I";
  if ("children" in node) return node.children.length === 0 ? "G" : null;
  if (node.width <= 1 || node.height <= 1) return "L";
  return "R";
}

function renderMap(boxes: LayoutBox[], grid: { cols: number; rows: number; cell: number }): string {
  const cells: string[][] = R.range(0, grid.rows).map(() => new Array<string>(grid.cols).fill("."));
  const owner: (number | null)[][] = R.range(0, grid.rows).map(() => new Array<number | null>(grid.cols).fill(null));
  boxes.forEach((b, i) => {
    const c0 = Math.max(0, Math.floor(b.x / grid.cell));
    const c1 = Math.min(grid.cols - 1, Math.ceil((b.x + b.w) / grid.cell) - 1);
    const r0 = Math.max(0, Math.floor(b.y / grid.cell));
    const r1 = Math.min(grid.rows - 1, Math.ceil((b.y + b.h) / grid.cell) - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        cells[r][c] = owner[r][c] === null ? b.kind : "#";
        owner[r][c] = i;
      }
    }
  });
  let ruler = "     ";
  for (let c = 0; c < grid.cols; c += 5) ruler += String(c * grid.cell).padEnd(5);
  const lines = [ruler.trimEnd()];
  R.range(0, grid.rows).forEach((r) => {
    const label = r % 5 === 0 ? String(r * grid.cell).padStart(4) + " " : "     ";
    lines.push(label + cells[r].join(""));
  });
  return lines.join("\n");
}

/** 1-D gap clustering: values within `tol` of the running group join it. */
function cluster(values: number[], tol: number): Cluster[] {
  const groups: Cluster[] = [];
  for (const v of R.sortBy(values, [(v) => v, "asc"])) {
    const last = R.last(groups);
    if (last && v - last.at <= tol) {
      last.count++;
      continue;
    }
    groups.push({ at: R.round(v, 1), count: 1 });
  }
  return R.pipe(groups, R.filter((g) => g.count >= 2), R.sortBy([(g) => g.count, "desc"]));
}

function findIssues(
  boxes: LayoutBox[],
  origin: Rect,
  columns: Cluster[],
  rightEdges: Cluster[],
  tol: number,
): Issues {
  const overflow = boxes
    .filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > origin.width + 0.5 || b.y + b.h > origin.height + 0.5)
    .map((b) => ({ id: b.id, name: b.name, right: R.round(b.x + b.w, 1), bottom: R.round(b.y + b.h, 1) }));

  const overlaps: Issues["overlaps"] = [];
  for (let i = 0; i < boxes.length && overlaps.length < MAX_OVERLAPS; i++) {
    for (let j = i + 1; j < boxes.length && overlaps.length < MAX_OVERLAPS; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix <= 0.5 || iy <= 0.5) continue;
      const contained = (ix >= a.w - 0.5 && iy >= a.h - 0.5) || (ix >= b.w - 0.5 && iy >= b.h - 0.5);
      overlaps.push({ a: `${a.id} ${a.name}`, b: `${b.id} ${b.name}`, contained });
    }
  }

  const nearMiss = boxes.flatMap((b) => {
    const edges: { edge: string; value: number; groups: Cluster[] }[] = [
      { edge: "left", value: b.x, groups: columns },
      { edge: "right", value: b.x + b.w, groups: rightEdges },
    ];
    return edges.flatMap(({ edge, value, groups }) => {
      const own = groups.find((g) => Math.abs(g.at - value) <= tol);
      const near = groups.find(
        (g) =>
          Math.abs(g.at - value) > tol &&
          Math.abs(g.at - value) <= NEAR_MISS_WINDOW &&
          (!own || g.count > own.count),
      );
      return near
        ? [{ id: b.id, name: b.name, edge, at: R.round(value, 1), column: near.at }]
        : [];
    });
  });

  return { overflow, overlaps, nearMiss };
}

const KIND_COLORS: Record<string, RGB> = {
  T: { r: 0.12, g: 0.47, b: 0.9 },
  I: { r: 0.95, g: 0.55, b: 0.1 },
  R: { r: 0.45, g: 0.45, b: 0.45 },
  L: { r: 0.45, g: 0.45, b: 0.45 },
  G: { r: 0.55, g: 0.3, b: 0.8 },
};
const RED: RGB = { r: 0.9, g: 0.1, b: 0.1 };
const GREEN: RGB = { r: 0.1, g: 0.6, b: 0.3 };

async function renderLayout(
  node: SceneNode,
  boxes: LayoutBox[],
  columns: Cluster[],
  rightEdges: Cluster[],
  issues: Issues,
) {
  const width = node.width;
  const height = node.height;
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const canvas = figma.createFrame();
  canvas.name = "figma-bridge layout (temporary)";
  canvas.resize(width, height);
  canvas.x = node.x + width + 200;
  canvas.y = node.y;
  canvas.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  const label = (text: string, x: number, y: number, color: RGB, size = 6) => {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: "Regular" };
    t.fontSize = size;
    t.characters = text;
    t.fills = [{ type: "SOLID", color }];
    t.x = x;
    t.y = y;
    canvas.appendChild(t);
  };
  const stroke = (x: number, y: number, w: number, h: number, color: RGB, weight: number, dash: number[] = []) => {
    const r = figma.createRectangle();
    r.resize(Math.max(w, 0.01), Math.max(h, 0.01));
    r.x = x;
    r.y = y;
    r.fills = [];
    r.strokes = [{ type: "SOLID", color }];
    r.strokeWeight = weight;
    r.strokeAlign = "INSIDE";
    r.dashPattern = dash;
    canvas.appendChild(r);
    return r;
  };
  const guide = (x: number, color: RGB) => {
    const l = figma.createLine();
    l.resize(height, 0);
    l.rotation = 90;
    l.x = x;
    l.y = height;
    l.strokes = [{ type: "SOLID", color }];
    l.strokeWeight = 0.75;
    l.dashPattern = [4, 4];
    canvas.appendChild(l);
  };

  let note: string | undefined;
  try {
    const shot = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
    const bg = figma.createRectangle();
    bg.resize(width, height);
    bg.fills = [{ type: "IMAGE", imageHash: figma.createImage(shot).hash, scaleMode: "FILL" }];
    bg.opacity = 0.2;
    canvas.appendChild(bg);
  } catch (err) {
    note = `no screenshot underlay: ${err instanceof Error ? err.message : String(err)}`;
  }

  columns.forEach((c, i) => {
    guide(c.at, KIND_COLORS.T);
    label(`x ${c.at} (${c.count})`, c.at + 2, 1 + (i % 3) * 7, KIND_COLORS.T);
  });
  rightEdges.forEach((c, i) => {
    guide(c.at, GREEN);
    label(`${c.at} (${c.count})`, c.at - 30, height - 8 - (i % 3) * 7, GREEN);
  });

  const overflowIds = new Set(issues.overflow.map((o) => o.id));
  for (const b of boxes) {
    const bad = overflowIds.has(b.id);
    const color = bad ? RED : KIND_COLORS[b.kind];
    stroke(b.x, b.y, b.w, b.h, color, bad ? 1.5 : 0.75);
    label(
      `${b.id} ${b.kind} ${R.round(b.x, 1)},${R.round(b.y, 1)} ${R.round(b.w, 1)}x${R.round(b.h, 1)}`,
      b.x + 2, b.y + 1, color,
    );
  }

  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const o of issues.overlaps) {
    const a = byId.get(o.a.split(" ")[0]);
    const b = byId.get(o.b.split(" ")[0]);
    if (!a || !b) continue;
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = stroke(x, y, Math.min(a.x + a.w, b.x + b.w) - x, Math.min(a.y + a.h, b.y + b.h) - y, RED, 1);
    r.fills = [{ type: "SOLID", color: RED, opacity: 0.15 }];
  }
  for (const m of issues.nearMiss) {
    const b = byId.get(m.id);
    if (!b) continue;
    const y = b.y + Math.min(b.h / 2, 12);
    stroke(Math.min(m.at, m.column), y, Math.abs(m.at - m.column), 0.01, RED, 1.5);
    label(`${m.edge} off by ${R.round(Math.abs(m.at - m.column), 1)}`, Math.max(m.at, m.column) + 2, y - 3, RED);
  }

  try {
    const bytes = await canvas.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    return { data: bytesToBase64(bytes), mimeType: "image/png", note };
  } finally {
    canvas.remove();
  }
}