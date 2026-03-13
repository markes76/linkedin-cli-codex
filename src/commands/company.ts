import type { Command } from "commander";

import { printCompanyEmployeesTable, printCompanyPostsTable, printCompanyProfileSummary } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

function parsePeriodDays(input: string | undefined): number {
  const raw = (input ?? "2d").trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*d$/);
  if (!match) {
    return 2;
  }

  const days = Number.parseInt(match[1] ?? "2", 10);
  return Number.isFinite(days) && days > 0 ? days : 2;
}

export function registerCompanyCommand(program: Command): void {
  program
    .command("company <company> [section]")
    .description("Inspect a LinkedIn company profile or associated employees")
    .option("--title <title>", "Filter employees by title keyword")
    .option("--period <period>", "Filter company posts by a relative window like 2d", "2d")
    .action((companyIdentifier, section, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          if (section === "employees") {
            const result = await api.getCompanyEmployees(companyIdentifier, {
              limit: withDefaultLimit(context.limit, 20),
              title: options.title,
            });

            await outputForCommand(context, result, {
              title: `${companyIdentifier} employees`,
              quietValue: result.count,
              renderTable: () => printCompanyEmployeesTable(result.items),
            });
            return;
          }

          if (section === "posts") {
            const result = await api.getCompanyPosts(companyIdentifier, {
              limit: withDefaultLimit(context.limit, 10),
              periodDays: parsePeriodDays(options.period),
            });

            await outputForCommand(context, result, {
              title: `${companyIdentifier} company posts`,
              quietValue: result.count,
              renderTable: () => printCompanyPostsTable(result.items),
            });
            return;
          }

          const result = await api.getCompanyProfile(companyIdentifier);
          await outputForCommand(context, result, {
            title: `${result.name} company profile`,
            quietValue: result.name,
            renderTable: () => printCompanyProfileSummary(result),
          });
        } finally {
          await close();
        }
      }),
    );
}
