import type { Command } from "commander";

import { printNetworkMapSummary, printProfileViewersTable, printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

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

          await outputForCommand(context, result, {
            title: options.sent ? "Sent LinkedIn invitations" : "Received LinkedIn invitations",
            quietValue: result.count,
            renderTable: () =>
              printTable(
                ["Name", "Headline", "Sent"],
                result.items.map((item) => [item.fullName, item.headline, item.sent ? "yes" : "no"]),
              ),
          });
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
          await outputForCommand(context, result, {
            title: "LinkedIn network suggestions",
            quietValue: result.count,
            renderTable: () =>
              printTable(
                ["Name", "Headline", "Profile"],
                result.items.map((item) => [item.fullName, item.headline, item.profileUrl]),
              ),
          });
        } finally {
          await close();
        }
      }),
    );

  network
    .command("map")
    .description("Summarize your network by company, location, industry, and seniority")
    .action((_options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getNetworkMap(withDefaultLimit(context.limit, 250));
          await outputForCommand(context, result, {
            title: "LinkedIn network map",
            quietValue: result.totalConnections,
            renderTable: () => printNetworkMapSummary(result),
          });
        } finally {
          await close();
        }
      }),
    );

  network
    .command("viewers")
    .description("View recent profile viewers when LinkedIn exposes them")
    .action((_options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getProfileViewers(withDefaultLimit(context.limit, 20));
          await outputForCommand(context, result, {
            title: "LinkedIn profile viewers",
            quietValue: result.count,
            renderTable: () => printProfileViewersTable(result),
          });
        } finally {
          await close();
        }
      }),
    );
}
