const CAMEL_CASE_PATTERN = /(?<!^)(?=[A-Z])/g;

export function camelToSnakeCase(name: string): string {
  return name.replace(CAMEL_CASE_PATTERN, "_").toUpperCase();
}

export function seqGet<T>(seq: T[], index: number): T | null {
  if (index < 0) {
    index = seq.length + index;
  }
  if (index >= 0 && index < seq.length) {
    return seq[index] ?? null;
  }
  return null;
}

export function ensureList<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value];
}

export function ensureCollection<T>(
  value: T | Iterable<T> | null | undefined,
): Iterable<T> {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string" || value instanceof Uint8Array) {
    return [value as T];
  }
  if (
    typeof value === "object" &&
    value !== null &&
    Symbol.iterator in (value as object)
  ) {
    return value as Iterable<T>;
  }
  return [value as T];
}

export function csv(...args: string[]): string;
export function csv(sep: string, ...args: string[]): string;
export function csv(...allArgs: string[]): string {
  // Simple version: join truthy strings with ", "
  const sep = ", ";
  return allArgs.filter(Boolean).join(sep);
}

export function csvWithSep(sep: string, ...args: string[]): string {
  return args.filter(Boolean).join(sep);
}

export function splitNumWords(
  value: string,
  sep: string,
  minNumWords: number,
  fillFromStart: boolean = true,
): Array<string | null> {
  const words: Array<string | null> = value.split(sep);
  const padding: Array<string | null> = Array(
    Math.max(0, minNumWords - words.length),
  ).fill(null);
  if (fillFromStart) {
    return [...padding, ...words];
  }
  return [...words, ...padding];
}

export function isInt(text: string): boolean {
  return /^-?\d+$/.test(text.trim());
}

export function isFloat(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return !isNaN(Number(trimmed)) && trimmed !== "";
}

export function nameSequence(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}${counter++}`;
}

export function findNewName(taken: Set<string> | string[], base: string): string {
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  if (!takenSet.has(base)) {
    return base;
  }
  let i = 2;
  let newName = `${base}_${i}`;
  while (takenSet.has(newName)) {
    i++;
    newName = `${base}_${i}`;
  }
  return newName;
}

export function whileChanging<T>(
  expression: T,
  func: (expr: T) => T,
  hashFn: (expr: T) => string | number,
): T {
  while (true) {
    const startHash = hashFn(expression);
    expression = func(expression);
    const endHash = hashFn(expression);
    if (startHash === endHash) {
      break;
    }
  }
  return expression;
}

export function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function toBool(
  value: string | boolean | null | undefined,
): string | boolean | null | undefined {
  if (typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1") {
    return true;
  }
  if (lower === "false" || lower === "0") {
    return false;
  }
  return value;
}

export function flatten(values: Iterable<unknown>): unknown[] {
  const result: unknown[] = [];
  for (const value of values) {
    if (isIterable(value)) {
      result.push(...flatten(value as Iterable<unknown>));
    } else {
      result.push(value);
    }
  }
  return result;
}

export function isIterable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" || value instanceof Uint8Array) return false;
  return typeof (value as Iterable<unknown>)[Symbol.iterator] === "function";
}

export function dictDepth(d: unknown): number {
  if (d === null || d === undefined || typeof d !== "object") {
    return 0;
  }
  const obj = d as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return 1;
  }
  return 1 + dictDepth(obj[keys[0]!]);
}

export function first<T>(it: Iterable<T>): T {
  for (const item of it) {
    return item;
  }
  throw new Error("Empty iterable");
}

export function mergeRanges(
  ranges: Array<[number, number]>,
): Array<[number, number]> {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]!;
    const last = merged[merged.length - 1]!;

    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}
