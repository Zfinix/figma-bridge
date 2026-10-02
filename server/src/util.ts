/**
 * Shared helpers: color conversion, wildcard matching, constants.
 */

export const SELECTION_CACHE_MS = 30_000;
export const CALL_TIMEOUT_MS = 30_000;
export const MAX_RESULT_CHARS = 400_000;

/** Figma RGB (0..1 floats) to "#rrggbb". */
export function hexOf(c: { r: number; g: number; b: number }): string {
  const ch = (v: number) => Math.round(v * 255);
  return "#" + ((ch(c.r) << 16) | (ch(c.g) << 8) | ch(c.b)).toString(16).padStart(6, "0");
}

/** Figma Paint to a compact descriptor: hex for solids, paint type otherwise. */
export function paintOf(f: { type: string; color?: unknown }): string {
  return f.type === "SOLID" && f.color ? hexOf(f.color as never) : f.type;
}

/** Case-insensitive glob where `*` matches any run of characters; everything else is literal. */
export function wildcardToRegex(pattern: string): RegExp {
  const source = pattern
    .split("*")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(source, "i");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}