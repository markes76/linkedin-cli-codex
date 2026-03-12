import type { Command } from "commander";

import { printKeyValue, printPostDetailSummary, printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { CliError, runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

export function registerFeedCommand(program: Command): void {
  program
    .command("feed")
    .description("View recent LinkedIn feed items")
    .option("--mine", "Show only your posts")
    .option("--stats", "Include engagement stats for your posts")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const result = await api.getFeed({
            limit: withDefaultLimit(context.limit, 10),
            mine: Boolean(options.mine),
          });

          await outputForCommand(context, result, {
            title: options.mine ? "My LinkedIn feed posts" : "LinkedIn feed",
            quietValue: result.count,
            renderTable: () => {
              const headers = options.stats ? ["Actor", "Published", "Text", "Likes", "Comments", "Reposts"] : ["Actor", "Published", "Text"];
              const rows = result.items.map((item) =>
                options.stats
                  ? [item.actorName, item.publishedAt, item.text, item.likes, item.comments, item.reposts]
                  : [item.actorName, item.publishedAt, item.text],
              );

              printTable(headers, rows);
            },
          });
        } finally {
          await close();
        }
      }),
    );

  const registerPostCommand = (name: string, description: string) =>
    program
      .command(`${name} <postUrl>`)
      .description(description)
      .option("--comments", "Include top-level comments")
      .option("--reactions", "Include reaction totals and breakdown when available")
      .action((postUrl, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const post = await api.getPostDetails(postUrl, {
            comments: Boolean(options.comments),
            reactions: Boolean(options.reactions),
          });

          if (!post) {
            throw new CliError("Could not match that post URL to one of your recent posts. Try increasing `--limit`.");
          }

          await outputForCommand(context, post, {
            title: "LinkedIn post detail",
            quietValue: post.id ?? post.actorName,
            renderTable: () => printPostDetailSummary(post),
          });
        } finally {
          await close();
        }
      }),
    );

  registerPostCommand("post", "Get a specific LinkedIn post with optional comments and reactions");
  registerPostCommand("posts", "Alias for `linkedin post`");
}
