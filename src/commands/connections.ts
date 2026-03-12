import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printKeyValue, printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerConnectionsCommand(program: Command): void {
  program
    .command("connections")
    .description("List your LinkedIn connections")
    .option("--search <query>", "Search connections by name")
    .option("--count", "Show only the total connection count")
    .option("--recent", "Show the most recent connections first")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const result = await api.getConnections({
          limit: withDefaultLimit(context.limit, options.count ? 1 : 25),
          recent: Boolean(options.recent),
          search: options.search,
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

        printTable(
          ["Name", "Headline", "Location", "Profile"],
          result.items.map((connection) => [
            connection.fullName,
            connection.headline,
            connection.location,
            connection.profileUrl,
          ]),
        );
      }),
    );
}

