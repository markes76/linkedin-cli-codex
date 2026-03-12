import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerNotificationsCommand(program: Command): void {
  program
    .command("notifications")
    .description("View recent LinkedIn notifications")
    .option("--unread", "Show unread notifications only")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const result = await api.getNotifications({
          limit: withDefaultLimit(context.limit, 15),
          unread: Boolean(options.unread),
        });

        if (context.json) {
          printJson(result);
          return;
        }

        printTable(
          ["Notification", "Unread", "Occurred"],
          result.items.map((notification) => [
            notification.text,
            notification.unread ? "yes" : "no",
            notification.occurredAt,
          ]),
        );
      }),
    );
}

