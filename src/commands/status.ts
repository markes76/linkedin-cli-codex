import type { Command } from "commander";

import { VoyagerApi } from "../api/voyager.js";
import { VoyagerClient } from "../api/client.js";
import { readSession } from "../auth/session.js";
import { printJson } from "../output/json.js";
import { printKeyValue } from "../output/table.js";
import { theme } from "../output/colors.js";
import { getCommandContext } from "../utils/command.js";
import { LinkedInAuthError, getErrorMessage, runCommand } from "../utils/errors.js";

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
          if (context.json) {
            printJson(payload);
            return;
          }

          console.log(theme.warning(payload.reason));
          return;
        }

        try {
          const api = new VoyagerApi(new VoyagerClient(session));
          const status = await api.getStatus(session.savedAt);

          if (context.json) {
            printJson(status);
            return;
          }

          printKeyValue([
            ["Authenticated", status.authenticated ? "yes" : "no"],
            ["Full name", status.fullName],
            ["Public identifier", status.publicIdentifier],
            ["Headline", status.headline],
            ["Saved at", status.savedAt],
          ]);
        } catch (error) {
          if (!(error instanceof LinkedInAuthError)) {
            throw error;
          }

          const payload = {
            authenticated: false,
            reason: getErrorMessage(error),
          };

          if (context.json) {
            printJson(payload);
            return;
          }

          console.log(theme.warning(payload.reason));
        }
      }),
    );
}

