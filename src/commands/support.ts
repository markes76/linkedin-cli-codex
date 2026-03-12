import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import type { CommandContext } from "../api/types.js";
import { VoyagerClient } from "../api/client.js";
import { VoyagerApi } from "../api/voyager.js";
import { requireSession, readSession } from "../auth/session.js";
import { setColorEnabled } from "../output/colors.js";
import { outputResult, type OutputOptions } from "../output/dispatch.js";
import { getCommandContext } from "../utils/command.js";

export async function getApiForCommand(command: Command): Promise<{
  context: CommandContext;
  api: VoyagerApi;
  close: () => Promise<void>;
}> {
  const context = getCommandContext(command);
  setColorEnabled(context.color);

  const session = await requireSession();
  const client = new VoyagerClient(session);
  const api = new VoyagerApi(client);

  return {
    context,
    api,
    close: async () => client.close(),
  };
}

export async function getSavedSessionStatus(): Promise<{
  context: CommandContext;
  savedAt?: string;
}> {
  return {
    context: { json: false, color: true, format: "table", copy: false, quiet: false },
    savedAt: (await readSession())?.savedAt,
  };
}

export async function outputForCommand<T>(context: CommandContext, payload: T, options: OutputOptions<T>): Promise<void> {
  await outputResult(context, payload, options);
}

export async function readBundledSkill(): Promise<string> {
  const file = new URL("../docs/skill.md", import.meta.url);
  return readFile(file, "utf8");
}

export function truncate(value: string | undefined, maxLength = 96): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
