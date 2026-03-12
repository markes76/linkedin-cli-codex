import type { Command } from "commander";

import { VoyagerApi } from "../api/voyager.js";
import { VoyagerClient } from "../api/client.js";
import { readSession } from "../auth/session.js";
import { printKeyValue } from "../output/table.js";
import { theme } from "../output/colors.js";
import { getCommandContext } from "../utils/command.js";
import { LinkedInAuthError, getErrorMessage, runCommand } from "../utils/errors.js";
import { outputForCommand } from "./support.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check whether the saved LinkedIn session is valid")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const session = await readSession();

        if (!session) {
          const payload = { authenticated: false, reason: "No saved session found." };
          await outputForCommand(context, payload, {
            title: "LinkedIn session status",
            quietValue: payload.reason,
            renderTable: () => console.log(theme.warning(payload.reason)),
          });
          return;
        }

        try {
          const client = new VoyagerClient(session);
          try {
            const api = new VoyagerApi(client);
            const status = await api.getStatus(session.savedAt);
            await outputForCommand(context, status, {
              title: "LinkedIn session status",
              quietValue: status.authenticated ? "authenticated" : "not authenticated",
              renderTable: () =>
                printKeyValue([
                  ["Authenticated", status.authenticated ? "yes" : "no"],
                  ["Full name", status.fullName],
                  ["Public identifier", status.publicIdentifier],
                  ["Headline", status.headline],
                  ["Saved at", status.savedAt],
                ]),
            });
          } finally {
            await client.close();
          }
        } catch (error) {
          if (!(error instanceof LinkedInAuthError)) {
            throw error;
          }

          const payload = {
            authenticated: false,
            reason: getErrorMessage(error),
          };
          await outputForCommand(context, payload, {
            title: "LinkedIn session status",
            quietValue: payload.reason,
            renderTable: () => console.log(theme.warning(payload.reason)),
          });
        }
      }),
    );
}
