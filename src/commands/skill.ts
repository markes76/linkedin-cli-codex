import { rm } from "node:fs/promises";

import type { Command } from "commander";

import { printKeyValue, printTable } from "../output/table.js";
import { theme } from "../output/colors.js";
import { CLAUDE_SKILL_FILE, CONFIG_SKILL_FILE } from "../utils/config.js";
import { runCommand } from "../utils/errors.js";
import { getCommandContext } from "../utils/command.js";
import { getInstalledSkillStatuses, installSkillTargets, readRepoSkill } from "../utils/skill.js";
import { outputForCommand } from "./support.js";

function renderStatusTable(statuses: Awaited<ReturnType<typeof getInstalledSkillStatuses>>): void {
  printTable(
    ["Target", "Installed", "In sync", "Version", "Path"],
    statuses.map((item) => [
      item.label,
      item.installed ? "yes" : "no",
      item.matchesRepo ? "yes" : item.installed ? "no" : "—",
      item.metadata?.skillVersion,
      item.path,
    ]),
  );
}

export function registerSkillCommand(program: Command): void {
  const skill = program.command("skill").description("Manage the linkedin-cli agent skill");

  skill
    .command("install")
    .description("Install the packaged skill into the local config and Claude Code skill directories")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const repoSkill = await readRepoSkill();
        const statuses = await installSkillTargets(repoSkill.content);

        await outputForCommand(context, {
          installed: true,
          repoSkillVersion: repoSkill.metadata.skillVersion,
          targets: statuses,
        }, {
          title: "linkedin-cli skill install",
          quietValue: statuses.map((item) => item.path).join("\n"),
          renderTable: () => renderStatusTable(statuses),
        });
      }),
    );

  skill
    .command("sync")
    .description("Overwrite installed skill files with the latest packaged skill")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const repoSkill = await readRepoSkill();
        const statuses = await installSkillTargets(repoSkill.content);

        await outputForCommand(context, {
          synced: true,
          repoSkillVersion: repoSkill.metadata.skillVersion,
          targets: statuses,
        }, {
          title: "linkedin-cli skill sync",
          quietValue: repoSkill.metadata.skillVersion,
          renderTable: () => renderStatusTable(statuses),
        });
      }),
    );

  skill
    .command("uninstall")
    .description("Remove installed skill files from the local config and Claude Code directories")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        await rm(CONFIG_SKILL_FILE, { force: true });
        await rm(CLAUDE_SKILL_FILE, { force: true });

        await outputForCommand(context, {
          installed: false,
          targets: [
            { label: "Config", path: CONFIG_SKILL_FILE },
            { label: "Claude Code", path: CLAUDE_SKILL_FILE },
          ],
        }, {
          title: "linkedin-cli skill uninstall",
          quietValue: "removed",
          renderTable: () =>
            printTable(
              ["Target", "Path"],
              [
                ["Config", CONFIG_SKILL_FILE],
                ["Claude Code", CLAUDE_SKILL_FILE],
              ],
            ),
        });
      }),
    );

  skill
    .command("status")
    .description("Check whether installed skill files exist and match the packaged repo skill")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const repoSkill = await readRepoSkill();
        const statuses = await getInstalledSkillStatuses(repoSkill.hash);

        await outputForCommand(context, {
          repoSkillVersion: repoSkill.metadata.skillVersion,
          repoCliVersionCompatible: repoSkill.metadata.cliVersionCompatible,
          repoHash: repoSkill.hash,
          targets: statuses,
        }, {
          title: "linkedin-cli skill status",
          quietValue: statuses.every((item) => item.installed && item.matchesRepo) ? "in-sync" : "out-of-sync",
          renderTable: () => {
            printKeyValue([
              ["Repo skill version", repoSkill.metadata.skillVersion],
              ["CLI version compatible", repoSkill.metadata.cliVersionCompatible],
              ["Last updated", repoSkill.metadata.lastUpdated],
            ]);
            console.log("");
            renderStatusTable(statuses);
          },
        });
      }),
    );

  skill
    .command("version")
    .description("Print the packaged skill_version from docs/skill.md")
    .action((_options, command) =>
      runCommand(async () => {
        const context = getCommandContext(command);
        const repoSkill = await readRepoSkill();

        await outputForCommand(context, {
          skillVersion: repoSkill.metadata.skillVersion,
          cliVersionCompatible: repoSkill.metadata.cliVersionCompatible,
          lastUpdated: repoSkill.metadata.lastUpdated,
        }, {
          title: "linkedin-cli skill version",
          quietValue: repoSkill.metadata.skillVersion,
          renderTable: () =>
            printKeyValue([
              ["Skill version", repoSkill.metadata.skillVersion],
              ["CLI version compatible", repoSkill.metadata.cliVersionCompatible],
              ["Last updated", repoSkill.metadata.lastUpdated],
            ]),
        });
      }),
    );

  skill
    .command("show")
    .description("Display the packaged docs/skill.md contents")
    .action(() =>
      runCommand(async () => {
        const repoSkill = await readRepoSkill();
        console.log(repoSkill.content.trimEnd());
      }),
    );
}
