import { access, chmod, rm, writeFile } from "node:fs/promises";

import type { Command } from "commander";

import { printKeyValue } from "../output/table.js";
import { theme } from "../output/colors.js";
import { CLAUDE_SKILL_FILE, ensureClaudeSkillDir } from "../utils/config.js";
import { runCommand } from "../utils/errors.js";
import { getCommandContext } from "../utils/command.js";
import { outputForCommand, readBundledSkill } from "./support.js";

async function isInstalled(): Promise<boolean> {
  try {
    await access(CLAUDE_SKILL_FILE);
    return true;
  } catch {
    return false;
  }
}

export function registerSkillCommand(program: Command): void {
  const skill = program.command("skill").description("Manage the Claude Code skill for linkedin-cli");

  skill
    .command("install")
    .description("Install the bundled Claude Code skill")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const content = await readBundledSkill();
        await ensureClaudeSkillDir();
        await writeFile(CLAUDE_SKILL_FILE, content, "utf8");
        await chmod(CLAUDE_SKILL_FILE, 0o600);

        const payload = {
          installed: true,
          path: CLAUDE_SKILL_FILE,
        };
        await outputForCommand(context, payload, {
          title: "linkedin-cli skill install",
          quietValue: payload.path,
          renderTable: () => console.log(theme.success(`Claude Code skill installed to ${CLAUDE_SKILL_FILE}`)),
        });
      }),
    );

  skill
    .command("uninstall")
    .description("Remove the Claude Code skill")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        await rm(CLAUDE_SKILL_FILE, { force: true });

        const payload = {
          installed: false,
          path: CLAUDE_SKILL_FILE,
        };
        await outputForCommand(context, payload, {
          title: "linkedin-cli skill uninstall",
          quietValue: payload.path,
          renderTable: () => console.log(theme.success(`Claude Code skill removed from ${CLAUDE_SKILL_FILE}`)),
        });
      }),
    );

  skill
    .command("status")
    .description("Check whether the Claude Code skill is installed")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const payload = {
          installed: await isInstalled(),
          path: CLAUDE_SKILL_FILE,
        };
        await outputForCommand(context, payload, {
          title: "linkedin-cli skill status",
          quietValue: payload.installed ? "installed" : "not installed",
          renderTable: () =>
            printKeyValue([
              ["Installed", payload.installed ? "yes" : "no"],
              ["Path", payload.path],
            ]),
        });
      }),
    );

  skill
    .command("show")
    .description("Display the bundled Claude Code skill contents")
    .action(() =>
      runCommand(async () => {
        const content = await readBundledSkill();
        console.log(content.trimEnd());
      }),
    );
}
