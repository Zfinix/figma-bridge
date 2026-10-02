(() => {
  // src/handlers/schema.ts
  function make(inner) {
    const run = (value, path, issues) => {
      if (issues.length > 0)
        throw issues;
      return inner(value, path, issues);
    };
    const schema = {
      parse: (value) => {
        const issues = [];
        return run(value, "", issues);
      },
      safeParse: (value) => {
        try {
          return { success: true, data: schema.parse(value) };
        } catch (issues) {
          return { success: false, error: { issues } };
        }
      },
      optional: () => make((value, path, issues) => value === undefined ? undefined : run(value, path, issues)),
      nullable: () => make((value, path, issues) => value === null ? null : run(value, path, issues)),
      default: (fallback) => make((value, path, issues) => value === undefined ? fallback : run(value, path, issues))
    };
    return schema;
  }
  function fail(path, message) {
    throw [{ path, message }];
  }
  var z = {
    string: () => make((value, path) => {
      if (typeof value !== "string")
        fail(path, "expected string");
      return value;
    }),
    number: () => {
      const checks = [];
      const build = () => {
        const num = make((value, path) => {
          if (typeof value !== "number" || Number.isNaN(value))
            fail(path, "expected number");
          for (const check of checks)
            check(value, path);
          return value;
        });
        num.positive = () => {
          checks.push((value, path) => {
            if (value <= 0)
              fail(path, "expected positive number");
          });
          return build();
        };
        num.int = () => {
          checks.push((value, path) => {
            if (!Number.isInteger(value))
              fail(path, "expected integer");
          });
          return build();
        };
        num.min = (bound) => {
          checks.push((value, path) => {
            if (value < bound)
              fail(path, `expected number >= ${bound}`);
          });
          return build();
        };
        return num;
      };
      return build();
    },
    boolean: () => make((value, path) => {
      if (typeof value !== "boolean")
        fail(path, "expected boolean");
      return value;
    }),
    any: () => make((value) => value),
    enum: (values) => make((value, path) => {
      if (typeof value !== "string" || !values.includes(value))
        fail(path, `expected one of ${values.join(", ")}`);
      return value;
    }),
    array: (item) => make((value, path, issues) => {
      if (!Array.isArray(value))
        fail(path, "expected array");
      return value.map((entry, i) => {
        try {
          return item.parse(entry);
        } catch (caught) {
          issues.push(...caught.map((issue) => ({ ...issue, path: `${path}.${i}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      });
    }),
    record: (valueSchema) => make((value, path, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        fail(path, "expected object");
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        try {
          out[key] = valueSchema.parse(entry);
        } catch (caught) {
          issues.push(...caught.map((issue) => ({ ...issue, path: `${path}.${key}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      }
      return out;
    }),
    object: (shape) => make((value, path, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        fail(path, "expected object");
      const out = {};
      for (const [key, fieldSchema] of Object.entries(shape)) {
        try {
          out[key] = fieldSchema.parse(value[key]);
        } catch (caught) {
          issues.push(...caught.map((issue) => ({ ...issue, path: `${path}.${key}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      }
      return out;
    })
  };

  // node_modules/remeda/dist/lazyDataLastImpl--3B10z3s.js
  function e(e2, t, n) {
    let r = (n2) => e2(n2, ...t);
    return n === undefined ? r : Object.assign(r, { lazy: n, lazyArgs: t });
  }

  // node_modules/remeda/dist/purry.js
  function t(t2, n, r) {
    let i = t2.length - n.length;
    if (i === 0)
      return t2(...n);
    if (i === 1)
      return e(t2, n, r);
    throw Error(`Wrong number of arguments`);
  }

  // node_modules/remeda/dist/withPrecision-DXRugSn5.js
  var e2 = (e3) => (n, r) => {
    if (r === 0)
      return e3(n);
    if (Math.abs(r) > 15)
      throw RangeError(`precision must be between -15 and 15`);
    if (!Number.isSafeInteger(r))
      throw TypeError(`precision must be an integer: ${r.toString()}`);
    return Number.isNaN(n) || !Number.isFinite(n) ? e3(n) : t2(e3(t2(n, r)), -r);
  };
  function t2(e3, t3) {
    let [n, r] = e3.toString().split(`e`, 2), i = `${n}e${((r === undefined ? 0 : Number(r)) + t3).toString()}`;
    return Number(i);
  }

  // node_modules/remeda/dist/chunk.js
  function t3(...t4) {
    return t(n, t4);
  }
  function n(e3, t4) {
    if (t4 < 1)
      throw RangeError(`chunk: A chunk size of '${t4.toString()}' would result in an infinite array`);
    if (e3.length === 0)
      return [];
    if (t4 >= e3.length)
      return [[...e3]];
    let n2 = Math.ceil(e3.length / t4), r = Array(n2);
    if (t4 === 1)
      for (let [t5, n3] of e3.entries())
        r[t5] = [n3];
    else
      for (let i = 0;i < n2; i += 1) {
        let n3 = i * t4;
        r[i] = e3.slice(n3, n3 + t4);
      }
    return r;
  }

  // node_modules/remeda/dist/utilityEvaluators-IxVD3t2o.js
  var t4 = { done: false, hasNext: false };

  // node_modules/remeda/dist/pipe.js
  function t5(e3, ...t6) {
    let i = e3, o = t6.map((e4) => (`lazy` in e4) ? { lazyEvaluator: e4.lazy(...e4.lazyArgs), isSingle: e4.lazy.single ?? false, index: 0, items: [] } : undefined), s = 0;
    for (;s < t6.length; ) {
      if (o[s] === undefined || !a(i)) {
        let e5 = t6[s];
        i = e5(i), s += 1;
        continue;
      }
      let e4 = n2(o, s), c = r(i, e4), { isSingle: l } = e4.at(-1);
      i = l ? c[0] : c, s += e4.length;
    }
    return i;
  }
  function n2(e3, t6) {
    let n3 = [];
    for (let r = t6;r < e3.length; r++) {
      let t7 = e3[r];
      if (t7 === undefined || (n3.push(t7), t7.isSingle))
        break;
    }
    return n3;
  }
  function r(e3, t6) {
    let n3 = [];
    for (let r2 of e3)
      if (i(r2, n3, t6))
        break;
    return n3;
  }
  function i(t6, n3, r2) {
    if (r2.length === 0)
      return n3.push(t6), false;
    let a = t6, o = t4, s = false;
    for (let [e3, { items: t7, lazyEvaluator: c }] of r2.entries())
      if (t7.push(a), o = c(a, t7.length - 1, t7), o.done && (s = true), o.hasNext) {
        if (o.hasMany ?? false) {
          for (let t8 of o.next)
            if (i(t8, n3, r2.slice(e3 + 1)))
              return true;
          return s;
        }
        a = o.next;
      } else
        break;
    return o.hasNext && n3.push(a), s;
  }
  function a(e3) {
    return typeof e3 == `string` || typeof e3 == `object` && !!e3 && Symbol.iterator in e3;
  }

  // node_modules/remeda/dist/purryOrderRules-ufWoj2V5.js
  var e3 = { asc: (e4, t6) => e4 > t6, desc: (e4, t6) => e4 < t6 };
  function t6(e4, t7) {
    let [n3, ...a2] = t7;
    if (!i2(n3))
      return e4(n3, r2(...a2));
    let o = r2(n3, ...a2);
    return (t8) => e4(t8, o);
  }
  function r2(t7, n3, ...i2) {
    let a2 = typeof t7 == `function` ? t7 : t7[0], o = typeof t7 == `function` ? `asc` : t7[1], s = e3[o], c = n3 === undefined ? undefined : r2(n3, ...i2);
    return (e4, t8) => {
      let n4 = a2(e4), r3 = a2(t8);
      return s(n4, r3) ? 1 : s(r3, n4) ? -1 : c?.(e4, t8) ?? 0;
    };
  }
  function i2(t7) {
    if (a2(t7))
      return true;
    if (typeof t7 != `object` || !Array.isArray(t7))
      return false;
    let [n3, r3, ...i3] = t7;
    return a2(n3) && typeof r3 == `string` && Object.hasOwn(e3, r3) && i3.length === 0;
  }
  var a2 = (e4) => typeof e4 == `function` && e4.length === 1;

  // node_modules/remeda/dist/filter.js
  function n3(...t7) {
    return t(r3, t7, i3);
  }
  var r3 = (e4, t7) => e4.filter(t7);
  var i3 = (e4) => (n4, r4, i4) => e4(n4, r4, i4) ? { done: false, hasNext: true, next: n4 } : t4;

  // node_modules/remeda/dist/last.js
  function t7(...t8) {
    return t(n4, t8);
  }
  var n4 = (e4) => e4.at(-1);

  // node_modules/remeda/dist/range.js
  function t8(...t9) {
    return t(n5, t9);
  }
  function n5(e4, t9) {
    let n6 = typeof t9 == `object` ? t9.step : 1;
    if (n6 === 0)
      throw RangeError(`range: step cannot be zero (0)!`);
    let i4 = r4(((typeof t9 == `object` ? t9.end : t9) - e4) / n6);
    return i4 <= 0 ? [] : Array.from({ length: i4 }, (t10, r4) => r4 === 0 ? e4 : e4 + r4 * n6);
  }
  function r4(e4) {
    if (e4 === 0)
      return 0;
    let t9 = Math.round(e4);
    return Math.abs(e4 - t9) / Math.abs(e4) < 0.000000000001 ? t9 : Math.ceil(e4);
  }

  // node_modules/remeda/dist/round.js
  function n6(...n7) {
    return t(e2(Math.round), n7);
  }

  // node_modules/remeda/dist/sortBy.js
  function t9(...t10) {
    return t6(n7, t10);
  }
  var n7 = (e4, t10) => [...e4].sort(t10);

  // src/handlers/protocol.ts
  var method = (schema, run) => ({ schema, run });
  async function requireNode(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId ?? "");
    if (!node)
      throw new Error(`no node ${nodeId}`);
    return node;
  }

  // src/handlers/serialize.ts
  var MAX_DEPTH = 8;
  function serialize(value, depth = 0) {
    if (value === null || value === undefined)
      return value;
    const t10 = typeof value;
    if (t10 === "string" || t10 === "boolean" || t10 === "number")
      return value;
    if (depth > MAX_DEPTH)
      return Array.isArray(value) ? "[...]" : "{...}";
    if (Array.isArray(value))
      return value.map((v) => serialize(v, depth + 1));
    if (t10 === "object") {
      return Object.fromEntries(Object.keys(value).map((k) => {
        try {
          return [k, serialize(value[k], depth + 1)];
        } catch {
          return [k, "<unserializable>"];
        }
      }));
    }
    return String(value);
  }
  var B64_CHUNK = 32768;
  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const binary = t3(Array.from(bytes), B64_CHUNK).map((chunk) => String.fromCharCode(...chunk)).join("");
    return btoa(binary);
  }
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i4 = 0;i4 < bin.length; i4++)
      bytes[i4] = bin.charCodeAt(i4);
    return bytes;
  }
  var MIME_BY_FORMAT = {
    PNG: "image/png",
    JPG: "image/jpeg",
    SVG: "image/svg+xml",
    PDF: "application/pdf"
  };

  // src/handlers/tree.ts
  var TEXT_PREVIEW = 120;
  var preview = (s, max) => s.length > max ? `${s.slice(0, max)}…` : s;
  var getTree = method(z.object({
    nodeId: z.string().optional(),
    maxDepth: z.number().int().min(0).default(6),
    filter: z.string().optional()
  }), async ({ nodeId, maxDepth, filter }) => {
    const re = filter ? new RegExp(filter) : null;
    if (!nodeId)
      await figma.loadAllPagesAsync();
    const root = nodeId ? await requireNode(nodeId) : figma.root;
    return summarize(root, 0, maxDepth, re);
  });
  function summarize(node, depth, maxDepth, filter) {
    const out = { id: node.id, name: node.name, type: node.type };
    if (node.type === "TEXT") {
      const chars = node.characters;
      out.characters = preview(chars, TEXT_PREVIEW);
    }
    if ("width" in node) {
      out.width = n6(node.width, 0);
      out.height = n6(node.height, 0);
    }
    if ("visible" in node && !node.visible)
      out.visible = false;
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
  var NODE_KEYS = [
    "fills",
    "strokes",
    "effects",
    "constraints",
    "layoutMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "itemSpacing",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "cornerRadius",
    "opacity",
    "visible",
    "characters",
    "fontSize",
    "fontName",
    "textAlignHorizontal",
    "textAlignVertical",
    "lineHeight",
    "letterSpacing"
  ];
  var getNode = method(z.object({ nodeId: z.string() }), async ({ nodeId }) => {
    const node = await requireNode(nodeId);
    const out = { id: node.id, name: node.name, type: node.type };
    const rec = node;
    for (const key of NODE_KEYS) {
      try {
        if (rec[key] !== undefined)
          out[key] = serialize(rec[key]);
      } catch {}
    }
    for (const key of ["absoluteTransform", "absoluteBoundingBox"]) {
      try {
        out[key] = rec[key];
      } catch {}
    }
    if ("children" in node) {
      out.children = node.children.map((c) => ({ id: c.id, name: c.name, type: c.type }));
    }
    return out;
  });

  // src/handlers/layout.ts
  var NAME_PREVIEW = 40;
  var preview2 = (s, max) => s.length > max ? `${s.slice(0, max)}…` : s;
  var MAX_OVERLAPS = 50;
  var NEAR_MISS_WINDOW = 8;
  var getLayout = method(z.object({
    nodeId: z.string(),
    cell: z.number().positive().default(10),
    tolerance: z.number().default(2),
    maxDepth: z.number().int().min(0).default(4),
    render: z.boolean().default(true)
  }), async ({ nodeId, cell, tolerance: tol, maxDepth, render }) => {
    const node = await requireNode(nodeId);
    if (!("absoluteBoundingBox" in node))
      throw new Error(`no frame ${nodeId}`);
    const origin = node.absoluteBoundingBox;
    if (!origin)
      throw new Error(`node ${nodeId} has no bounds`);
    const boxes = [];
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
      width: n6(origin.width, 1),
      height: n6(origin.height, 1),
      cell,
      legend: "T text, I image, R shape, L line, G group, # overlap",
      map,
      image,
      columns,
      rightEdges,
      issues,
      nodes: boxes.map(({ id, name, kind, x, y, w, h, fontSize }) => ({
        id,
        name,
        kind,
        x: n6(x, 1),
        y: n6(y, 1),
        w: n6(w, 1),
        h: n6(h, 1),
        fontSize
      }))
    };
  });
  function collectBoxes(node, origin, out, depth, maxDepth) {
    if (!("children" in node))
      return;
    for (const child of node.children) {
      if (!child.visible)
        continue;
      const bb = child.absoluteBoundingBox;
      if (!bb)
        continue;
      const kind = boxKind(child);
      if (kind === null && depth < maxDepth) {
        collectBoxes(child, origin, out, depth + 1, maxDepth);
        continue;
      }
      const box = {
        id: child.id,
        name: preview2(child.name, NAME_PREVIEW),
        kind: kind ?? "G",
        x: bb.x - origin.x,
        y: bb.y - origin.y,
        w: bb.width,
        h: bb.height
      };
      if (child.type === "TEXT" && typeof child.fontSize === "number")
        box.fontSize = child.fontSize;
      out.push(box);
    }
  }
  function boxKind(node) {
    if (node.type === "TEXT")
      return "T";
    if (node.type === "LINE")
      return "L";
    const fills = "fills" in node ? node.fills : null;
    if (Array.isArray(fills) && fills.some((f) => f.type === "IMAGE" && f.visible !== false))
      return "I";
    if ("children" in node)
      return node.children.length === 0 ? "G" : null;
    if (node.width <= 1 || node.height <= 1)
      return "L";
    return "R";
  }
  function renderMap(boxes, grid) {
    const cells = t8(0, grid.rows).map(() => new Array(grid.cols).fill("."));
    const owner = t8(0, grid.rows).map(() => new Array(grid.cols).fill(null));
    boxes.forEach((b, i4) => {
      const c0 = Math.max(0, Math.floor(b.x / grid.cell));
      const c1 = Math.min(grid.cols - 1, Math.ceil((b.x + b.w) / grid.cell) - 1);
      const r0 = Math.max(0, Math.floor(b.y / grid.cell));
      const r1 = Math.min(grid.rows - 1, Math.ceil((b.y + b.h) / grid.cell) - 1);
      for (let r5 = r0;r5 <= r1; r5++) {
        for (let c = c0;c <= c1; c++) {
          cells[r5][c] = owner[r5][c] === null ? b.kind : "#";
          owner[r5][c] = i4;
        }
      }
    });
    let ruler = "     ";
    for (let c = 0;c < grid.cols; c += 5)
      ruler += String(c * grid.cell).padEnd(5);
    const lines = [ruler.trimEnd()];
    t8(0, grid.rows).forEach((r5) => {
      const label = r5 % 5 === 0 ? String(r5 * grid.cell).padStart(4) + " " : "     ";
      lines.push(label + cells[r5].join(""));
    });
    return lines.join(`
`);
  }
  function cluster(values, tol) {
    const groups = [];
    for (const v of t9(values, [(v2) => v2, "asc"])) {
      const last = t7(groups);
      if (last && v - last.at <= tol) {
        last.count++;
        continue;
      }
      groups.push({ at: n6(v, 1), count: 1 });
    }
    return t5(groups, n3((g) => g.count >= 2), t9([(g) => g.count, "desc"]));
  }
  function findIssues(boxes, origin, columns, rightEdges, tol) {
    const overflow = boxes.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > origin.width + 0.5 || b.y + b.h > origin.height + 0.5).map((b) => ({ id: b.id, name: b.name, right: n6(b.x + b.w, 1), bottom: n6(b.y + b.h, 1) }));
    const overlaps = [];
    for (let i4 = 0;i4 < boxes.length && overlaps.length < MAX_OVERLAPS; i4++) {
      for (let j = i4 + 1;j < boxes.length && overlaps.length < MAX_OVERLAPS; j++) {
        const a3 = boxes[i4];
        const b = boxes[j];
        const ix = Math.min(a3.x + a3.w, b.x + b.w) - Math.max(a3.x, b.x);
        const iy = Math.min(a3.y + a3.h, b.y + b.h) - Math.max(a3.y, b.y);
        if (ix <= 0.5 || iy <= 0.5)
          continue;
        const contained = ix >= a3.w - 0.5 && iy >= a3.h - 0.5 || ix >= b.w - 0.5 && iy >= b.h - 0.5;
        overlaps.push({ a: `${a3.id} ${a3.name}`, b: `${b.id} ${b.name}`, contained });
      }
    }
    const nearMiss = boxes.flatMap((b) => {
      const edges = [
        { edge: "left", value: b.x, groups: columns },
        { edge: "right", value: b.x + b.w, groups: rightEdges }
      ];
      return edges.flatMap(({ edge, value, groups }) => {
        const own = groups.find((g) => Math.abs(g.at - value) <= tol);
        const near = groups.find((g) => Math.abs(g.at - value) > tol && Math.abs(g.at - value) <= NEAR_MISS_WINDOW && (!own || g.count > own.count));
        return near ? [{ id: b.id, name: b.name, edge, at: n6(value, 1), column: near.at }] : [];
      });
    });
    return { overflow, overlaps, nearMiss };
  }
  var KIND_COLORS = {
    T: { r: 0.12, g: 0.47, b: 0.9 },
    I: { r: 0.95, g: 0.55, b: 0.1 },
    R: { r: 0.45, g: 0.45, b: 0.45 },
    L: { r: 0.45, g: 0.45, b: 0.45 },
    G: { r: 0.55, g: 0.3, b: 0.8 }
  };
  var RED = { r: 0.9, g: 0.1, b: 0.1 };
  var GREEN = { r: 0.1, g: 0.6, b: 0.3 };
  async function renderLayout(node, boxes, columns, rightEdges, issues) {
    const width = node.width;
    const height = node.height;
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const canvas = figma.createFrame();
    canvas.name = "figma-bridge layout (temporary)";
    canvas.resize(width, height);
    canvas.x = node.x + width + 200;
    canvas.y = node.y;
    canvas.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    const label = (text, x, y, color, size = 6) => {
      const t10 = figma.createText();
      t10.fontName = { family: "Inter", style: "Regular" };
      t10.fontSize = size;
      t10.characters = text;
      t10.fills = [{ type: "SOLID", color }];
      t10.x = x;
      t10.y = y;
      canvas.appendChild(t10);
    };
    const stroke = (x, y, w, h, color, weight, dash = []) => {
      const r5 = figma.createRectangle();
      r5.resize(Math.max(w, 0.01), Math.max(h, 0.01));
      r5.x = x;
      r5.y = y;
      r5.fills = [];
      r5.strokes = [{ type: "SOLID", color }];
      r5.strokeWeight = weight;
      r5.strokeAlign = "INSIDE";
      r5.dashPattern = dash;
      canvas.appendChild(r5);
      return r5;
    };
    const guide = (x, color) => {
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
    let note;
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
    columns.forEach((c, i4) => {
      guide(c.at, KIND_COLORS.T);
      label(`x ${c.at} (${c.count})`, c.at + 2, 1 + i4 % 3 * 7, KIND_COLORS.T);
    });
    rightEdges.forEach((c, i4) => {
      guide(c.at, GREEN);
      label(`${c.at} (${c.count})`, c.at - 30, height - 8 - i4 % 3 * 7, GREEN);
    });
    const overflowIds = new Set(issues.overflow.map((o) => o.id));
    for (const b of boxes) {
      const bad = overflowIds.has(b.id);
      const color = bad ? RED : KIND_COLORS[b.kind];
      stroke(b.x, b.y, b.w, b.h, color, bad ? 1.5 : 0.75);
      label(`${b.id} ${b.kind} ${n6(b.x, 1)},${n6(b.y, 1)} ${n6(b.w, 1)}x${n6(b.h, 1)}`, b.x + 2, b.y + 1, color);
    }
    const byId = new Map(boxes.map((b) => [b.id, b]));
    for (const o of issues.overlaps) {
      const a3 = byId.get(o.a.split(" ")[0]);
      const b = byId.get(o.b.split(" ")[0]);
      if (!a3 || !b)
        continue;
      const x = Math.max(a3.x, b.x);
      const y = Math.max(a3.y, b.y);
      const r5 = stroke(x, y, Math.min(a3.x + a3.w, b.x + b.w) - x, Math.min(a3.y + a3.h, b.y + b.h) - y, RED, 1);
      r5.fills = [{ type: "SOLID", color: RED, opacity: 0.15 }];
    }
    for (const m of issues.nearMiss) {
      const b = byId.get(m.id);
      if (!b)
        continue;
      const y = b.y + Math.min(b.h / 2, 12);
      stroke(Math.min(m.at, m.column), y, Math.abs(m.at - m.column), 0.01, RED, 1.5);
      label(`${m.edge} off by ${n6(Math.abs(m.at - m.column), 1)}`, Math.max(m.at, m.column) + 2, y - 3, RED);
    }
    try {
      const bytes = await canvas.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
      return { data: bytesToBase64(bytes), mimeType: "image/png", note };
    } finally {
      canvas.remove();
    }
  }

  // src/handlers/nodes.ts
  var parentOf = async (parentId) => {
    if (!parentId)
      return figma.currentPage;
    return requireNode(parentId);
  };
  var xy = (params, node) => {
    if (params.x !== undefined)
      node.x = params.x;
    if (params.y !== undefined)
      node.y = params.y;
  };
  var createFrame = method(z.object({
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
    counterAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "BASELINE"]).optional()
  }), async (p) => {
    const parent = await parentOf(p.parentId);
    const frame = figma.createFrame();
    frame.name = p.name ?? "Frame";
    frame.resize(p.width, p.height);
    xy(p, frame);
    if (p.fills)
      frame.fills = p.fills;
    if (p.cornerRadius !== undefined)
      frame.cornerRadius = p.cornerRadius;
    if (p.layoutMode && p.layoutMode !== "NONE") {
      frame.layoutMode = p.layoutMode;
      for (const [key, value] of Object.entries(p)) {
        if (value === undefined || !["itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "primaryAxisAlignItems", "counterAxisAlignItems"].includes(key))
          continue;
        frame[key] = value;
      }
    }
    parent.appendChild(frame);
    return { id: frame.id, name: frame.name };
  });
  var createText = method(z.object({
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
    y: z.number().optional()
  }), async (p) => {
    const parent = await parentOf(p.parentId);
    const text = figma.createText();
    text.name = p.name ?? "Text";
    if (p.fontName)
      text.fontName = p.fontName;
    text.characters = p.characters;
    if (p.fontSize !== undefined)
      text.fontSize = p.fontSize;
    if (p.fills)
      text.fills = p.fills;
    if (p.textAlignHorizontal)
      text.textAlignHorizontal = p.textAlignHorizontal;
    if (p.textAutoResize)
      text.textAutoResize = p.textAutoResize;
    if (p.width !== undefined && p.height !== undefined)
      text.resize(p.width, p.height);
    xy(p, text);
    parent.appendChild(text);
    return { id: text.id, name: text.name };
  });
  var setProperties = method(z.object({ nodeId: z.string(), properties: z.record(z.any()) }), async ({ nodeId, properties }) => {
    const node = await requireNode(nodeId);
    const applied = Object.keys(properties);
    for (const [key, value] of Object.entries(properties)) {
      node[key] = value;
    }
    return { id: node.id, applied };
  });
  var deleteNode = method(z.object({ nodeId: z.string() }), async ({ nodeId }) => {
    const node = await requireNode(nodeId);
    const type = node.type;
    node.remove();
    return { removed: nodeId, type };
  });
  var cloneNode = method(z.object({ nodeId: z.string(), parentId: z.string().optional(), x: z.number().optional(), y: z.number().optional() }), async ({ nodeId, parentId, ...pos }) => {
    const node = await requireNode(nodeId);
    const copy = node.clone();
    const parent = parentId ? await parentOf(parentId) : node.parent;
    if (!parent)
      throw new Error(`no node ${parentId}`);
    parent.appendChild(copy);
    xy(pos, copy);
    return { id: copy.id, name: copy.name };
  });
  var setImageFill = method(z.object({ nodeId: z.string(), base64: z.string(), scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).default("FILL") }), async ({ nodeId, base64, scaleMode }) => {
    const node = await requireNode(nodeId);
    if (!("fills" in node))
      throw new Error(`node ${nodeId} (${node.type}) has no fills`);
    const image = figma.createImage(base64ToBytes(base64));
    node.fills = [
      { type: "IMAGE", imageHash: image.hash, scaleMode }
    ];
    return { id: node.id, imageHash: image.hash, scaleMode };
  });
  var setEffects = method(z.object({ nodeId: z.string(), effects: z.array(z.any()) }), async ({ nodeId, effects }) => {
    const node = await requireNode(nodeId);
    node.effects = effects;
    return { id: node.id, effects: serialize(node.effects) };
  });
  var paint = (prop) => method(z.object({
    nodeId: z.string(),
    fills: z.array(z.any()).optional(),
    strokes: z.array(z.any()).optional()
  }), async ({ nodeId, fills, strokes }) => {
    const value = (prop === "fills" ? fills : strokes) ?? [];
    const node = await requireNode(nodeId);
    node[prop] = value;
    return { id: node.id, [prop]: serialize(node[prop]) };
  });
  var setFills = paint("fills");
  var setStrokes = paint("strokes");
  var importComponent = method(z.object({ componentKey: z.string(), parentId: z.string().optional(), x: z.number().optional(), y: z.number().optional() }), async ({ componentKey, parentId, ...pos }) => {
    const component = await figma.importComponentByKeyAsync(componentKey);
    const instance = component.createInstance();
    const parent = await parentOf(parentId);
    parent.appendChild(instance);
    xy(pos, instance);
    return { id: instance.id, name: instance.name, componentKey };
  });
  var getSelection = method(z.object({}), () => ({
    nodes: figma.currentPage.selection.map((n8) => ({ id: n8.id, name: n8.name, type: n8.type }))
  }));
  var setSelection = method(z.object({ nodeIds: z.array(z.string()) }), async ({ nodeIds }) => {
    const nodes = [];
    for (const id of nodeIds)
      nodes.push(await requireNode(id));
    figma.currentPage.selection = nodes;
    if (nodes.length > 0)
      figma.viewport.scrollAndZoomIntoView(nodes);
    return { selected: nodes.map((n8) => n8.id) };
  });
  var screenshot = method(z.object({
    nodeId: z.string().optional(),
    viewport: z.boolean().optional(),
    format: z.enum(["png", "jpg"]).default("png"),
    scale: z.number().positive().default(1)
  }), async ({ nodeId, viewport, format, scale }) => {
    let node = figma.currentPage;
    let note = null;
    if (nodeId) {
      node = await requireNode(nodeId);
    } else if (viewport) {
      if (figma.currentPage.children.filter((c) => c.visible).length === 0)
        throw new Error("page is empty");
      note = "viewport export approximated by rendering all top-level nodes";
    }
    const figFormat = format.toUpperCase();
    const bytes = await node.exportAsync({ format: figFormat, constraint: { type: "SCALE", value: scale } });
    return { data: bytesToBase64(bytes), mimeType: MIME_BY_FORMAT[figFormat], note };
  });
  var EXPORT_FORMATS = ["png", "jpg", "svg", "pdf"];
  var exportNode = method(z.object({
    nodeId: z.string(),
    format: z.enum(EXPORT_FORMATS).default("png"),
    scale: z.number().positive().default(2)
  }), async ({ nodeId, format, scale }) => {
    const node = await requireNode(nodeId);
    const figFormat = format.toUpperCase();
    const settings = figFormat === "PNG" || figFormat === "JPG" ? { format: figFormat, constraint: { type: "SCALE", value: scale } } : { format: figFormat };
    const bytes = await node.exportAsync(settings);
    return { data: bytesToBase64(bytes), mimeType: MIME_BY_FORMAT[figFormat] };
  });
  var notify = method(z.object({ message: z.string() }), ({ message }) => {
    figma.notify(message);
    return null;
  });
  var ping = method(z.object({}), () => ({
    file: figma.root.name,
    page: figma.currentPage.name
  }));
  var execute = method(z.object({ code: z.string() }), async ({ code }) => {
    const fn = new Function("figma", `"use strict";
return (async () => {
${code}
})();`);
    return { value: serialize(await fn(figma)) };
  });

  // src/handlers/index.ts
  var METHODS = {
    ping,
    get_tree: getTree,
    get_node: getNode,
    get_layout: getLayout,
    create_frame: createFrame,
    create_text: createText,
    set_properties: setProperties,
    delete_node: deleteNode,
    clone_node: cloneNode,
    set_image_fill: setImageFill,
    set_effects: setEffects,
    set_fills: setFills,
    set_strokes: setStrokes,
    import_component: importComponent,
    get_selection: getSelection,
    set_selection: setSelection,
    get_screenshot: screenshot,
    export_node: exportNode,
    notify,
    execute
  };
  function dispatch(msg) {
    if (msg.type !== "request" || typeof msg.id !== "number" || typeof msg.method !== "string")
      return;
    const id = msg.id;
    const def = METHODS[msg.method];
    if (!def) {
      reply(id, false, null, `unknown method ${msg.method}`);
      return;
    }
    const parsed = def.schema.safeParse(msg.params ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues.map((i4) => `${i4.path}: ${i4.message}`).join("; ");
      reply(id, false, null, `bad params for ${msg.method}: ${issue}`);
      return;
    }
    Promise.resolve(def.run(parsed.data)).then((result) => reply(id, true, result, null)).catch((err) => reply(id, false, null, err instanceof Error ? err.message : String(err)));
  }
  function reply(id, ok, result, error) {
    figma.ui.postMessage({ source: "figma-bridge", type: "response", id, ok, result, error });
  }

  // src/code.ts
  figma.showUI(__html__, { width: 240, height: 120, themeColors: true });
  figma.on("selectionchange", () => {
    figma.ui.postMessage({
      source: "figma-bridge",
      type: "event",
      name: "selectionchange",
      nodes: figma.currentPage.selection.map((n8) => n8.id)
    });
  });
  figma.ui.onmessage = (msg) => {
    if (msg?.source !== "figma-bridge")
      return;
    dispatch(msg);
  };
})();
