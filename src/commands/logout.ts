import type { Command } from "commander";

import { resetLinkedInBrowserProfile } from "../auth/browser.js";
import { clearSession } from "../auth/session.js";
import { theme } from "../output/colors.js";
import { getCommandContext } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { outputForCommand } from "./support.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear the saved LinkedIn session")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        await resetLinkedInBrowserProfile();
        const removed = await clearSession();
        const payload = {
          authenticated: false,
          removed,
        };
        await outputForCommand(context, payload, {
          title: "LinkedIn logout",
          quietValue: removed ? "cleared" : "not found",
          renderTable: () =>
            console.log(
              removed
                ? theme.success("LinkedIn session and browser profile cleared.")
                : theme.warning("No saved LinkedIn session was found. The CLI browser profile was still reset."),
            ),
        });
      }),
    );
}
