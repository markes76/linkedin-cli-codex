import type { Command } from "commander";

import { parseLinkedInProfileIdentifier } from "../api/voyager.js";
import { printContentSearchResultsTable, printContentStatsSummary, printFeedItemsTable, printHashtagResearchSummary } from "../output/table.js";
import { runCommand } from "../utils/errors.js";
import { withDefaultLimit } from "../utils/command.js";
import { getApiForCommand, outputForCommand } from "./support.js";

function parsePeriodDays(input: string | undefined): number {
  const raw = (input ?? "30d").trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*d$/);
  if (!match) {
    return 30;
  }

  const days = Number.parseInt(match[1] ?? "30", 10);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

export function registerContentCommand(program: Command): void {
  const content = program.command("content").description("Read your LinkedIn content and performance data");

  content
    .command("stats")
    .description("Summarize your post performance over a time period")
    .option("--period <period>", "Time period like 30d or 90d", "30d")
    .option("--top <count>", "How many top posts to include", (value) => Number.parseInt(value, 10), 5)
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const stats = await api.getContentStats({
            periodDays: parsePeriodDays(options.period),
            top: Number.isFinite(options.top) && options.top > 0 ? options.top : 5,
          });

          await outputForCommand(context, stats, {
            title: "LinkedIn content stats",
            quietValue: stats.totalPosts,
            renderTable: () => {
              printContentStatsSummary(stats);

              if (stats.topPosts.length) {
                console.log("");
                printFeedItemsTable(stats.topPosts);
              }
            },
          });
        } finally {
          await close();
        }
      }),
    );

  content
    .command("search <query>")
    .description("Search LinkedIn posts and articles")
    .option("--author <linkedinUrl>", "Filter by author profile")
    .option("--period <period>", "Time period like 30d", "30d")
    .option("--type <type>", "Content type: post, article, document, video")
    .action((query, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.searchContent({
            keywords: query,
            limit: withDefaultLimit(context.limit, 10),
            author: options.author ? parseLinkedInProfileIdentifier(options.author) : undefined,
            periodDays: options.period ? parsePeriodDays(options.period) : undefined,
            type: options.type,
          });

          await outputForCommand(context, result, {
            title: "LinkedIn content search",
            quietValue: result.count,
            renderTable: () => printContentSearchResultsTable(result.items),
          });
        } finally {
          await close();
        }
      }),
    );

  content
    .command("hashtags <hashtag>")
    .description("Research a LinkedIn hashtag")
    .action((hashtag, _options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getHashtagResearch(hashtag, withDefaultLimit(context.limit, 10));
          await outputForCommand(context, result, {
            title: `LinkedIn hashtag #${result.hashtag}`,
            quietValue: result.followerCount ?? result.recentPosts.length,
            renderTable: () => printHashtagResearchSummary(result),
          });
        } finally {
          await close();
        }
      }),
    );
}
