import type { Command } from "commander";

import type { CommandContext } from "../api/types.js";

export function getCommandContext(command: Command): CommandContext {
  const options = command.optsWithGlobals<{
    json?: boolean;
    color?: boolean;
    limit?: string | number;
  }>();

  const limit =
    options.limit === undefined
      ? undefined
      : typeof options.limit === "number"
        ? options.limit
        : Number.parseInt(options.limit, 10);

  return {
    json: Boolean(options.json),
    color: options.color ?? true,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}

export function withDefaultLimit(limit: number | undefined, fallback: number): number {
  return limit && limit > 0 ? limit : fallback;
}

