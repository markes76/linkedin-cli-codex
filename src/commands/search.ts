import type { Command } from "commander";

import type { SearchVertical } from "../api/types.js";
import { printSearchResultsTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

function registerSearchVertical(search: Command, vertical: SearchVertical, description: string): void {
  const command = search.command(`${vertical} <query>`).description(description);

  if (vertical === "people") {
    command
      .option("--company <company>", "Filter people results by current company")
      .option("--title <title>", "Filter people results by current title")
      .option("--location <location>", "Filter people results by location")
      .action((query, options, commandInstance) =>
        runCommand(async () => {
          const { context, api, close } = await getApiForCommand(commandInstance);
          try {
            const result = await api.searchPeople({
              company: options.company,
              keywords: query,
              limit: withDefaultLimit(context.limit, 10),
              location: options.location,
              title: options.title,
            });

            await outputForCommand(context, result, {
              title: "LinkedIn people search",
              quietValue: result.count,
              renderTable: () => printSearchResultsTable(result.items),
            });
          } finally {
            await close();
          }
        }),
      );
    return;
  }

  command.action((query, _options, commandInstance) =>
    runCommand(async () => {
      const { context, api, close } = await getApiForCommand(commandInstance);
      try {
        const result = await api.search(vertical, query, withDefaultLimit(context.limit, 10));
        await outputForCommand(context, result, {
          title: `LinkedIn ${vertical} search`,
          quietValue: result.count,
          renderTable: () => printSearchResultsTable(result.items),
        });
      } finally {
        await close();
      }
    }),
  );
}

export function registerSearchCommand(program: Command): void {
  const search = program.command("search").description("Search LinkedIn people, companies, jobs, or posts");

  registerSearchVertical(search, "people", "Search LinkedIn people");
  registerSearchVertical(search, "companies", "Search LinkedIn companies");
  registerSearchVertical(search, "jobs", "Search LinkedIn jobs");
  registerSearchVertical(search, "posts", "Search LinkedIn posts");
}
