import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerNetworkCommand(program: Command): void {
  const network = program.command("network").description("LinkedIn network insights");

  network
    .command("invitations")
    .description("View pending connection invitations")
    .option("--sent", "Show sent invitations instead of received")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getInvitations({
            limit: withDefaultLimit(context.limit, 20),
            sent: Boolean(options.sent),
          });

          if (context.json) {
            printJson(result);
            return;
          }

          printTable(
            ["Name", "Headline", "Sent"],
            result.items.map((item) => [item.fullName, item.headline, item.sent ? "yes" : "no"]),
          );
        } finally {
          await close();
        }
      }),
    );

  network
    .command("suggestions")
    .description("View people LinkedIn suggests you may know")
    .action((_options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getSuggestions(withDefaultLimit(context.limit, 20));

          if (context.json) {
            printJson(result);
            return;
          }

          printTable(
            ["Name", "Headline", "Profile"],
            result.items.map((item) => [item.fullName, item.headline, item.profileUrl]),
          );
        } finally {
          await close();
        }
      }),
    );
}
