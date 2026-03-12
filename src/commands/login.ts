import type { Command } from "commander";

import { loginWithBrowser } from "../auth/browser.js";
import { writeSession } from "../auth/session.js";
import { theme } from "../output/colors.js";
import { getCommandContext } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { SESSION_FILE } from "../utils/config.js";
import { outputForCommand } from "./support.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Open Chrome, sign in to LinkedIn, and save your session cookies")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const session = await loginWithBrowser();
        await writeSession(session);
        const payload = {
          authenticated: true,
          savedAt: session.savedAt,
          path: SESSION_FILE,
        };
        await outputForCommand(context, payload, {
          title: "LinkedIn login",
          quietValue: payload.path,
          renderTable: () => {
            console.log(theme.success("LinkedIn session saved."));
            console.log(theme.muted(`Session file: ${SESSION_FILE}`));
          },
        });
      }),
    );
}
