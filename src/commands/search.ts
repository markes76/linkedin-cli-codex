import type { Command } from "commander";

import type { SearchVertical } from "../api/types.js";
import { printJson } from "../output/json.js";
import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

function registerSearchVertical(search: Command, vertical: SearchVertical, description: string): void {
  search
    .command(`${vertical} <query>`)
    .description(description)
    .action((query, _options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const result = await api.search(vertical, query, withDefaultLimit(context.limit, 10));

        if (context.json) {
          printJson(result);
          return;
        }

        printTable(
          ["Title", "Subtitle", "Location", "URL"],
          result.items.map((item) => [item.title, item.subtitle, item.location, item.url]),
        );
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

