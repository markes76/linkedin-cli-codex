import { writeFile } from "node:fs/promises";

import type { Command } from "commander";

import type { ConnectionSummary } from "../api/types.js";
import { toCsv } from "../output/csv.js";
import { printJson } from "../output/json.js";
import { printConnectionsTable, printKeyValue } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

function toConnectionRows(items: ConnectionSummary[]): Array<Record<string, string | number | undefined>> {
  return items.map((connection) => ({
    name: connection.fullName,
    headline: connection.headline,
    currentCompany: connection.currentCompany,
    currentTitle: connection.currentTitle,
    location: connection.location,
    industry: connection.industry,
    connectedAt: connection.connectedAt,
    profileUrl: connection.profileUrl,
  }));
}

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

      if (context.json) {
        printJson(payload);
        return;
      }

      printKeyValue([["Connections", payload.count]]);
      return;
    }

    if (context.json) {
      printJson(result);
      return;
    }

    printConnectionsTable(result.items);
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
    .option("--format <format>", "Export format", "csv")
    .option("--output <filepath>", "Write the export to a file")
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

          if (options.format === "json") {
            if (options.output) {
              await writeFile(options.output, JSON.stringify(result.items, null, 2), "utf8");
              return;
            }

            printJson(result.items);
            return;
          }

          const csv = toCsv(
            ["name", "headline", "currentCompany", "currentTitle", "location", "industry", "connectedAt", "profileUrl"],
            toConnectionRows(result.items),
          );

          if (options.output) {
            await writeFile(options.output, csv, "utf8");
            return;
          }

          process.stdout.write(csv);
        } finally {
          await close();
        }
      }),
    );
}
