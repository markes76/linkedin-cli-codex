import type { Command } from "commander";

import { resetLinkedInBrowserProfile } from "../auth/browser.js";
import { clearSession } from "../auth/session.js";
import { theme } from "../output/colors.js";
import { runCommand } from "../utils/errors.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear the saved LinkedIn session")
    .action(() =>
      runCommand(async () => {
        await resetLinkedInBrowserProfile();
        const removed = await clearSession();
        console.log(
          removed
            ? theme.success("LinkedIn session and browser profile cleared.")
            : theme.warning("No saved LinkedIn session was found. The CLI browser profile was still reset."),
        );
      }),
    );
}
