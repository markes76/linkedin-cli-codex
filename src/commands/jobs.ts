import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { theme } from "../output/colors.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

function registerJobsBucket(jobs: Command, bucket: "saved" | "applied" | "recommended", description: string): void {
  jobs
    .command(bucket)
    .description(description)
    .action((_options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getJobsBucket(bucket, withDefaultLimit(context.limit, 20));

          if (context.json) {
            printJson(result);
            return;
          }

          if (result.items.length === 0) {
            console.log(theme.warning(`The \`${bucket}\` jobs bucket is scaffolded but not wired to a stable Voyager endpoint yet.`));
            return;
          }

          printTable(
            ["Title", "Company", "Location", "URL"],
            result.items.map((item) => [item.title, item.company, item.location, item.url]),
          );
        } finally {
          await close();
        }
      }),
    );
}

export function registerJobsCommand(program: Command): void {
  const jobs = program.command("jobs").description("Inspect LinkedIn jobs data");

  registerJobsBucket(jobs, "saved", "View your saved jobs");
  registerJobsBucket(jobs, "applied", "View jobs you have applied to");
  registerJobsBucket(jobs, "recommended", "View recommended jobs");
}
