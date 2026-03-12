import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import type { CommandContext } from "../api/types.js";
import { VoyagerClient } from "../api/client.js";
import { VoyagerApi } from "../api/voyager.js";
import { requireSession, readSession } from "../auth/session.js";
import { printJson } from "../output/json.js";
import { setColorEnabled } from "../output/colors.js";
import { getCommandContext } from "../utils/command.js";

export async function getApiForCommand(command: Command): Promise<{
  context: CommandContext;
  api: VoyagerApi;
}> {
  const context = getCommandContext(command);
  setColorEnabled(context.color);

  const session = await requireSession();
  const api = new VoyagerApi(new VoyagerClient(session));

  return { context, api };
}

export async function getSavedSessionStatus(): Promise<{
  context: CommandContext;
  savedAt?: string;
}> {
  return {
    context: { json: false, color: true },
    savedAt: (await readSession())?.savedAt,
  };
}

export function outputJsonOrTable<T>(context: CommandContext, payload: T, renderTable: () => void): void {
  if (context.json) {
    printJson(payload);
    return;
  }

  renderTable();
}

export async function readBundledSkill(): Promise<string> {
  const file = new URL("../../docs/skill.md", import.meta.url);
  return readFile(file, "utf8");
}

export function truncate(value: string | undefined, maxLength = 96): string {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

