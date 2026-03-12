import type { Command } from "commander";

import type { CommandContext } from "../api/types.js";

function detectFormatFromOutput(filepath: string | undefined): CommandContext["format"] | undefined {
  if (!filepath) {
    return undefined;
  }

  const normalized = filepath.toLowerCase();
  if (normalized.endsWith(".json")) {
    return "json";
  }

  if (normalized.endsWith(".csv")) {
    return "csv";
  }

  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return "md";
  }

  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) {
    return "html";
  }

  return "table";
}

export function getCommandContext(command: Command): CommandContext {
  const options = command.optsWithGlobals<{
    json?: boolean;
    csv?: boolean;
    md?: boolean;
    html?: boolean;
    output?: string;
    copy?: boolean;
    quiet?: boolean;
    color?: boolean;
    limit?: string | number;
  }>();

  const limit =
    options.limit === undefined
      ? undefined
      : typeof options.limit === "number"
        ? options.limit
        : Number.parseInt(options.limit, 10);

  const format =
    options.json ? "json"
    : options.csv ? "csv"
    : options.md ? "md"
    : options.html ? "html"
    : detectFormatFromOutput(options.output) ?? "table";

  return {
    json: format === "json",
    color: options.color ?? true,
    format,
    limit: Number.isFinite(limit) ? limit : undefined,
    output: options.output,
    copy: Boolean(options.copy),
    quiet: Boolean(options.quiet),
  };
}

export function withDefaultLimit(limit: number | undefined, fallback: number): number {
  return limit && limit > 0 ? limit : fallback;
}
