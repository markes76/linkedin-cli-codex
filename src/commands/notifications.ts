import type { Command } from "commander";

import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

export function registerNotificationsCommand(program: Command): void {
  program
    .command("notifications")
    .description("View recent LinkedIn notifications")
    .option("--unread", "Show unread notifications only")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getNotifications({
            limit: withDefaultLimit(context.limit, 15),
            unread: Boolean(options.unread),
          });

          await outputForCommand(context, result, {
            title: "LinkedIn notifications",
            quietValue: result.count,
            renderTable: () =>
              printTable(
                ["Notification", "Unread", "Occurred"],
                result.items.map((notification) => [
                  notification.text,
                  notification.unread ? "yes" : "no",
                  notification.occurredAt,
                ]),
              ),
          });
        } finally {
          await close();
        }
      }),
    );
}
