import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printJobDetailSummary, printJobsTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
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

          printJobsTable(result.items);
        } finally {
          await close();
        }
      }),
    );
}

export function registerJobsCommand(program: Command): void {
  const jobs = program.command("jobs").description("Inspect LinkedIn jobs data");

  jobs
    .command("search <query>")
    .description("Search LinkedIn job listings")
    .option("--location <location>", "Filter by location")
    .option("--company <company>", "Filter by company")
    .option("--remote", "Remote roles only")
    .option("--hybrid", "Hybrid roles only")
    .option("--onsite", "On-site roles only")
    .action((query, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const workplaceType = options.remote ? "remote" : options.hybrid ? "hybrid" : options.onsite ? "onsite" : undefined;
          const result = await api.searchJobs({
            keywords: query,
            limit: withDefaultLimit(context.limit, 20),
            location: options.location,
            company: options.company,
            workplaceType,
          });

          if (context.json) {
            printJson(result);
            return;
          }

          printJobsTable(result.items);
        } finally {
          await close();
        }
      }),
    );

  jobs
    .command("detail <jobUrl>")
    .description("Get a full LinkedIn job listing")
    .action((jobUrl, _options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getJobDetails(jobUrl);

          if (context.json) {
            printJson(result);
            return;
          }

          printJobDetailSummary(result);
        } finally {
          await close();
        }
      }),
    );

  registerJobsBucket(jobs, "saved", "View your saved jobs");
  registerJobsBucket(jobs, "applied", "View jobs you have applied to");
  registerJobsBucket(jobs, "recommended", "View recommended jobs");
}
