import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printCompanyEmployeesTable, printCompanyProfileSummary } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerCompanyCommand(program: Command): void {
  program
    .command("company <company> [section]")
    .description("Inspect a LinkedIn company profile or associated employees")
    .option("--title <title>", "Filter employees by title keyword")
    .action((companyIdentifier, section, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          if (section === "employees") {
            const result = await api.getCompanyEmployees(companyIdentifier, {
              limit: withDefaultLimit(context.limit, 20),
              title: options.title,
            });

            if (context.json) {
              printJson(result);
              return;
            }

            printCompanyEmployeesTable(result.items);
            return;
          }

          const result = await api.getCompanyProfile(companyIdentifier);

          if (context.json) {
            printJson(result);
            return;
          }

          printCompanyProfileSummary(result);
        } finally {
          await close();
        }
      }),
    );
}
