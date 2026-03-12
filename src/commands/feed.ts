import type { Command } from "commander";

import { printJson } from "../output/json.js";
import { printKeyValue, printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { CliError, runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerFeedCommand(program: Command): void {
  program
    .command("feed")
    .description("View recent LinkedIn feed items")
    .option("--mine", "Show only your posts")
    .option("--stats", "Include engagement stats for your posts")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const result = await api.getFeed({
          limit: withDefaultLimit(context.limit, 10),
          mine: Boolean(options.mine),
        });

        if (context.json) {
          printJson(result);
          return;
        }

        const headers = options.stats ? ["Actor", "Published", "Text", "Likes", "Comments", "Reposts"] : ["Actor", "Published", "Text"];
        const rows = result.items.map((item) =>
          options.stats
            ? [item.actorName, item.publishedAt, item.text, item.likes, item.comments, item.reposts]
            : [item.actorName, item.publishedAt, item.text],
        );

        printTable(headers, rows);
      }),
    );

  program
    .command("posts <postUrl>")
    .description("Get analytics for a specific post URL")
    .action((postUrl, _options, command) =>
      runCommand(async () => {
        const { context, api } = await getApiForCommand(command);
        const post = await api.getAnalyticsForPost(postUrl, withDefaultLimit(context.limit, 50));

        if (!post) {
          throw new CliError("Could not match that post URL to one of your recent posts. Try increasing `--limit`.");
        }

        if (context.json) {
          printJson(post);
          return;
        }

        printKeyValue([
          ["Actor", post.actorName],
          ["Published", post.publishedAt],
          ["Text", post.text],
          ["Likes", post.likes],
          ["Comments", post.comments],
          ["Reposts", post.reposts],
        ]);
      }),
    );
}

