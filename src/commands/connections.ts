import type { Command } from "commander";

import { printConnectionsTable, printKeyValue, printMutualConnectionsTable } from "../output/table.js";
import { parseLinkedInProfileIdentifier } from "../api/voyager.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

async function runConnectionsList(
  options: {
    company?: string;
    count?: boolean;
    recent?: boolean;
    search?: string;
    sort?: string;
    title?: string;
  },
  command: Command,
): Promise<void> {
  const { context, api, close } = await getApiForCommand(command);
  try {
    const result = await api.getConnections({
      company: options.company,
      limit: withDefaultLimit(context.limit, options.count ? 1 : 25),
      recent: Boolean(options.recent) || options.sort === "recent",
      search: options.search,
      title: options.title,
    });

    if (options.count) {
      const payload = {
        count: result.total ?? result.items.length,
      };
      await outputForCommand(context, payload, {
        title: "LinkedIn connection count",
        quietValue: payload.count,
        renderTable: () => printKeyValue([["Connections", payload.count]]),
      });
      return;
    }

    await outputForCommand(context, result, {
      title: "LinkedIn connections",
      quietValue: result.count,
      renderTable: () => printConnectionsTable(result.items),
    });
  } finally {
    await close();
  }
}

export function registerConnectionsCommand(program: Command): void {
  const connections = program.command("connections").description("List, filter, and export your LinkedIn connections");

  connections
    .option("--search <query>", "Search connections by name")
    .option("--company <company>", "Filter connections by current company")
    .option("--title <title>", "Filter connections by current title")
    .option("--count", "Show only the total connection count")
    .option("--recent", "Show the most recent connections first")
    .option("--sort <sort>", "Sort order", "default")
    .action((options, command) =>
      runCommand(async () => {
        await runConnectionsList(options, command);
      }),
    );

  connections
    .command("list")
    .description("List your LinkedIn connections with optional filters")
    .option("--search <query>", "Search connections by name")
    .option("--company <company>", "Filter connections by current company")
    .option("--title <title>", "Filter connections by current title")
    .option("--sort <sort>", "Sort order", "default")
    .action((options, command) =>
      runCommand(async () => {
        await runConnectionsList(options, command);
      }),
    );

  connections
    .command("export")
    .description("Export your LinkedIn connections")
    .option("--search <query>", "Search connections by name")
    .option("--company <company>", "Filter connections by current company")
    .option("--title <title>", "Filter connections by current title")
    .option("--sort <sort>", "Sort order", "default")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getConnections({
            company: options.company,
            limit: withDefaultLimit(context.limit, 100),
            recent: options.sort === "recent",
            search: options.search,
            title: options.title,
          });

          const exportContext = context.format === "table" ? { ...context, format: "csv" as const } : context;
          await outputForCommand(exportContext, result.items, {
            title: "LinkedIn connections export",
            quietValue: result.items.length,
          });
        } finally {
          await close();
        }
      }),
    );

  connections
    .command("mutual <linkedinUrl>")
    .description("List mutual connections between you and another LinkedIn member")
    .action((linkedinUrl, _options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getMutualConnections(parseLinkedInProfileIdentifier(linkedinUrl), withDefaultLimit(context.limit, 25));
          await outputForCommand(context, result, {
            title: "LinkedIn mutual connections",
            quietValue: result.total,
            renderTable: () => printMutualConnectionsTable(result),
          });
        } finally {
          await close();
        }
      }),
    );
}
