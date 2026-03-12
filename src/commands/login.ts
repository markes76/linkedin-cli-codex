import type { Command } from "commander";

import { loginWithBrowser } from "../auth/browser.js";
import { writeSession } from "../auth/session.js";
import { theme } from "../output/colors.js";
import { runCommand } from "../utils/errors.js";
import { SESSION_FILE } from "../utils/config.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Open Chrome, sign in to LinkedIn, and save your session cookies")
    .action(() =>
      runCommand(async () => {
        const session = await loginWithBrowser();
        await writeSession(session);

        console.log(theme.success("LinkedIn session saved."));
        console.log(theme.muted(`Session file: ${SESSION_FILE}`));
      }),
    );
}

