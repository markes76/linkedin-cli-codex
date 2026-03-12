import type { Command } from "commander";

import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

export function registerMessagesCommand(program: Command): void {
  program
    .command("messages")
    .description("View recent LinkedIn messages (read-only)")
    .option("--unread", "Show unread messages only")
    .option("--search <query>", "Search recent messages")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getMessages({
            limit: withDefaultLimit(context.limit, 15),
            unread: Boolean(options.unread),
            search: options.search,
          });

          await outputForCommand(context, result, {
            title: "LinkedIn messages",
            quietValue: result.count,
            renderTable: () =>
              printTable(
                ["Title", "Participants", "Unread", "Updated", "Snippet"],
                result.items.map((message) => [
                  message.title,
                  message.participants.join(", "),
                  message.unread ? "yes" : "no",
                  message.updatedAt,
                  message.snippet,
                ]),
              ),
          });
        } finally {
          await close();
        }
      }),
    );
}
