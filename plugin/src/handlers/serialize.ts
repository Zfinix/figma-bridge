import * as R from "remeda";


const MAX_DEPTH = 8;

/** Deep-plain-object conversion that survives the Plugin API's live proxies. */
export function serialize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "boolean" || t === "number") return value;
  if (depth > MAX_DEPTH) return Array.isArray(value) ? "[...]" : "{...}";
  if (Array.isArray(value)) return value.map((v) => serialize(v, depth + 1));
  if (t === "object") {
    return Object.fromEntries(
      Object.keys(value as object).map((k) => {
        try {
          return [k, serialize((value as Record<string, unknown>)[k], depth + 1)];
        } catch {
          return [k, "<unserializable>"];
        }
      }),
    );
  }
  return String(value);
}

const B64_CHUNK = 0x8000;

export function bytesToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  const binary = R.chunk(Array.from(bytes), B64_CHUNK)
    .map((chunk) => String.fromCharCode(...chunk))
    .join("");
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const MIME_BY_FORMAT: Record<string, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  SVG: "image/svg+xml",
  PDF: "application/pdf",
};