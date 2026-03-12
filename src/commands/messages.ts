import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerMessagesCommand(program: Command): void {
  program
    .command("messages")
    .description("View recent LinkedIn messages (read-only)")
    .option("--unread", "Show unread messages only")
    .option("--search <query>", "Search recent messages")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const result = await api.getMessages({
          limit: withDefaultLimit(context.limit, 15),
          unread: Boolean(options.unread),
          search: options.search,
        });

        if (context.json) {
          printJson(result);
          return;
        }

        printTable(
          ["Title", "Participants", "Unread", "Updated", "Snippet"],
          result.items.map((message) => [
            message.title,
            message.participants.join(", "),
            message.unread ? "yes" : "no",
            message.updatedAt,
            message.snippet,
          ]),
        );
      }),
    );
}

