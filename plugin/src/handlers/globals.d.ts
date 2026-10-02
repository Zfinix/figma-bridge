// Minimal sandbox globals: Figma's plugin iframe has them but the ES2020 lib does not.
declare const parent: { postMessage(message: unknown, targetOrigin: string): void };
declare const window: {
  onmessage: ((event: { data: { pluginMessage?: unknown } }) => void) | null;
};
declare function btoa(data: string): string;
declare function atob(data: string): string;
