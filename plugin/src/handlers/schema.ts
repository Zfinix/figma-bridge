// Minimal Zod-compatible validator. Figma's plugin sandbox has no BigInt,
// which zod v4 touches at module scope, so the real library cannot load here.

export type Issue = { path: string; message: string };

export interface Schema<T = unknown> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Issue[] } };
  optional(): Schema<T | undefined>;
  nullable(): Schema<T | null>;
  default(value: T): Schema<T>;
}

export interface NumberSchema extends Schema<number> {
  positive(): NumberSchema;
  int(): NumberSchema;
  min(bound: number): NumberSchema;
}

type Inner = (value: unknown, path: string, issues: Issue[]) => unknown;

function make<T>(inner: Inner): Schema<T> {
  const run = (value: unknown, path: string, issues: Issue[]): T => {
    if (issues.length > 0) throw issues;
    return inner(value, path, issues) as T;
  };
  const schema: Schema<T> = {
    parse: (value) => {
      const issues: Issue[] = [];
      return run(value, "", issues);
    },
    safeParse: (value) => {
      try {
        return { success: true, data: schema.parse(value) };
      } catch (issues) {
        return { success: false, error: { issues: issues as Issue[] } };
      }
    },
    optional: () => make<T | undefined>((value, path, issues) =>
      value === undefined ? undefined : run(value, path, issues)),
    nullable: () => make<T | null>((value, path, issues) =>
      value === null ? null : run(value, path, issues)),
    default: (fallback: T) => make<T>((value, path, issues) =>
      value === undefined ? fallback : run(value, path, issues)),
  };
  return schema;
}

function fail(path: string, message: string): never {
  throw [{ path, message }];
}

export const z = {
  string: () => make<string>((value, path) => {
    if (typeof value !== "string") fail(path, "expected string");
    return value;
  }),
  number: (): NumberSchema => {
    const checks: Array<(value: number, path: string) => void> = [];
    const build = (): NumberSchema => {
      const num = make<number>((value, path) => {
        if (typeof value !== "number" || Number.isNaN(value)) fail(path, "expected number");
        for (const check of checks) check(value, path);
        return value;
      }) as NumberSchema;
      num.positive = () => {
        checks.push((value, path) => { if (value <= 0) fail(path, "expected positive number"); });
        return build();
      };
      num.int = () => {
        checks.push((value, path) => { if (!Number.isInteger(value)) fail(path, "expected integer"); });
        return build();
      };
      num.min = (bound: number) => {
        checks.push((value, path) => { if (value < bound) fail(path, `expected number >= ${bound}`); });
        return build();
      };
      return num;
    };
    return build();
  },
  boolean: () => make<boolean>((value, path) => {
    if (typeof value !== "boolean") fail(path, "expected boolean");
    return value;
  }),
  any: () => make<any>((value) => value),
  enum: <U extends string>(values: readonly U[]) =>
    make<U>((value, path) => {
      if (typeof value !== "string" || !(values as readonly string[]).includes(value)) fail(path, `expected one of ${values.join(", ")}`);
      return value;
    }),
  array: <T>(item: Schema<T>) =>
    make<T[]>((value, path, issues) => {
      if (!Array.isArray(value)) fail(path, "expected array");
      return value.map((entry, i) => {
        try {
          return item.parse(entry);
        } catch (caught) {
          issues.push(...(caught as Issue[]).map((issue) => ({ ...issue, path: `${path}.${i}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      });
    }),
  record: (valueSchema: Schema<unknown>) =>
    make<Record<string, unknown>>((value, path, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected object");
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        try {
          out[key] = valueSchema.parse(entry);
        } catch (caught) {
          issues.push(...(caught as Issue[]).map((issue) => ({ ...issue, path: `${path}.${key}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      }
      return out;
    }),
  object: <T extends Record<string, Schema<unknown>>>(shape: T) =>
    make<{ [K in keyof T]: T[K] extends Schema<infer U> ? U : never }>((value, path, issues) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected object");
      const out: Record<string, unknown> = {};
      for (const [key, fieldSchema] of Object.entries(shape)) {
        try {
          out[key] = fieldSchema.parse((value as Record<string, unknown>)[key]);
        } catch (caught) {
          issues.push(...(caught as Issue[]).map((issue) => ({ ...issue, path: `${path}.${key}.${issue.path}`.replace(/^\.+/, "") })));
          throw issues;
        }
      }
      return out as never;
    }),
};
