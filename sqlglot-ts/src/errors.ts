export enum ErrorLevel {
  IGNORE = "IGNORE",
  WARN = "WARN",
  RAISE = "RAISE",
  IMMEDIATE = "IMMEDIATE",
}

export class SqlglotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlglotError";
  }
}

export class UnsupportedError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}

export interface ParseErrorDetail {
  description?: string | null;
  line?: number | null;
  col?: number | null;
  start_context?: string | null;
  highlight?: string | null;
  end_context?: string | null;
  into_expression?: string | null;
}

export class ParseError extends SqlglotError {
  errors: ParseErrorDetail[];

  constructor(message: string, errors?: ParseErrorDetail[]) {
    super(message);
    this.name = "ParseError";
    this.errors = errors ?? [];
  }

  static new(
    message: string,
    description?: string | null,
    line?: number | null,
    col?: number | null,
    startContext?: string | null,
    highlight?: string | null,
    endContext?: string | null,
    intoExpression?: string | null,
  ): ParseError {
    return new ParseError(message, [
      {
        description: description ?? null,
        line: line ?? null,
        col: col ?? null,
        start_context: startContext ?? null,
        highlight: highlight ?? null,
        end_context: endContext ?? null,
        into_expression: intoExpression ?? null,
      },
    ]);
  }
}

export class TokenError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export class OptimizeError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "OptimizeError";
  }
}

export class SchemaError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export class ExecuteError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "ExecuteError";
  }
}

export class GenerateError extends SqlglotError {
  constructor(message: string) {
    super(message);
    this.name = "GenerateError";
  }
}

// ANSI escape codes for error formatting
export const ANSI_UNDERLINE = "\x1b[4m";
export const ANSI_RESET = "\x1b[0m";
export const ERROR_MESSAGE_CONTEXT_DEFAULT = 100;

export function highlightSql(
  sql: string,
  positions: Array<[number, number]>,
  contextLength: number = ERROR_MESSAGE_CONTEXT_DEFAULT,
): [string, string, string, string] {
  if (positions.length === 0) {
    throw new Error("positions must contain at least one (start, end) tuple");
  }

  let startContext = "";
  let endContext = "";
  let firstHighlightStart = 0;
  const formattedParts: string[] = [];
  let previousPartEnd = 0;
  const sortedPositions = [...positions].sort((a, b) => a[0] - b[0]);

  const firstPos = sortedPositions[0]!;
  if (firstPos[0] > 0) {
    firstHighlightStart = firstPos[0];
    startContext = sql.slice(
      Math.max(0, firstHighlightStart - contextLength),
      firstHighlightStart,
    );
    formattedParts.push(startContext);
    previousPartEnd = firstHighlightStart;
  }

  for (const [start, end] of sortedPositions) {
    const highlightStart = Math.max(start, previousPartEnd);
    const highlightEnd = end + 1;
    if (highlightStart >= highlightEnd) {
      continue;
    }
    if (highlightStart > previousPartEnd) {
      formattedParts.push(sql.slice(previousPartEnd, highlightStart));
    }
    formattedParts.push(
      `${ANSI_UNDERLINE}${sql.slice(highlightStart, highlightEnd)}${ANSI_RESET}`,
    );
    previousPartEnd = highlightEnd;
  }

  if (previousPartEnd < sql.length) {
    endContext = sql.slice(previousPartEnd, previousPartEnd + contextLength);
    formattedParts.push(endContext);
  }

  const formattedSql = formattedParts.join("");
  const highlight = sql.slice(firstHighlightStart, previousPartEnd);

  return [formattedSql, startContext, highlight, endContext];
}

export function concatMessages(errors: unknown[], maximum: number): string {
  const msg = errors.slice(0, maximum).map((e) => String(e));
  const remaining = errors.length - maximum;
  if (remaining > 0) {
    msg.push(`... and ${remaining} more`);
  }
  return msg.join("\n\n");
}

export function mergeErrors(errors: ParseError[]): ParseErrorDetail[] {
  return errors.flatMap((error) => error.errors);
}
