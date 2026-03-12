import type { Command } from "commander";

import { printKeyValue, printTable } from "../output/table.js";
import { withDefaultLimit } from "../utils/command.js";
import { CliError, runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

export function registerAnalyticsCommand(program: Command): void {
  program
    .command("analytics")
    .description("View creator analytics from your recent LinkedIn posts")
    .option("--post <postUrl>", "Show analytics for a specific post URL")
    .option("--followers", "Show follower and audience snapshot data")
    .action((options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const limit = withDefaultLimit(context.limit, 30);

          if (options.post) {
            const post = await api.getAnalyticsForPost(options.post, Math.max(limit, 50));
            if (!post) {
              throw new CliError("Could not locate that post in your recent posts. Try a larger `--limit`.");
            }

            await outputForCommand(context, post, {
              title: "LinkedIn post analytics",
              quietValue: post.id ?? post.actorName,
              renderTable: () =>
                printKeyValue([
                  ["Actor", post.actorName],
                  ["Published", post.publishedAt],
                  ["Text", post.text],
                  ["Likes", post.likes],
                  ["Comments", post.comments],
                  ["Reposts", post.reposts],
                ]),
            });
            return;
          }

          if (options.followers) {
            const snapshot = await api.getFollowerSnapshot();
            await outputForCommand(context, snapshot, {
              title: "LinkedIn follower snapshot",
              quietValue: snapshot.followers ?? snapshot.fullName,
              renderTable: () => {
                printKeyValue([
                  ["Full name", snapshot.fullName],
                  ["Headline", snapshot.headline],
                  ["Followers", snapshot.followers],
                  ["Connections", snapshot.connections],
                  ["Location", snapshot.location],
                ]);
                console.log("Demographic breakdowns are not exposed by this scaffold yet.");
              },
            });
            return;
          }

          const analytics = await api.getAnalytics(limit);
          await outputForCommand(context, analytics, {
            title: "LinkedIn analytics",
            quietValue: analytics.postsAnalyzed,
            renderTable: () => {
              printKeyValue([
                ["Window", analytics.window],
                ["Posts analyzed", analytics.postsAnalyzed],
                ["Total likes", analytics.totalLikes],
                ["Total comments", analytics.totalComments],
                ["Total reposts", analytics.totalReposts],
              ]);

              if (analytics.topPosts.length) {
                console.log("");
                printTable(
                  ["Published", "Text", "Likes", "Comments", "Reposts"],
                  analytics.topPosts.map((post) => [
                    post.publishedAt,
                    post.text,
                    post.likes,
                    post.comments,
                    post.reposts,
                  ]),
                );
              }
            },
          });
        } finally {
          await close();
        }
      }),
    );
}
