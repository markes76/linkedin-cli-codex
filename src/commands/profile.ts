import type { Command } from "commander";

import type { DeepProfileSummary } from "../api/types.js";
import { parseLinkedInProfileIdentifier } from "../api/voyager.js";
import {
  printContentSearchResultsTable,
  printEducationTable,
  printExperienceTable,
  printKeyValue,
  printProfileSummary,
  printTable,
} from "../output/table.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand, outputForCommand } from "./support.js";

function parsePeriodDays(input: string | undefined): number | undefined {
  if (!input) {
    return undefined;
  }

  const raw = input.trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*d$/);
  if (!match) {
    return undefined;
  }

  const days = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(days) && days > 0 ? days : undefined;
}

export function registerProfileCommand(program: Command): void {
  program
    .command("profile [linkedinUrl]")
    .description("View your LinkedIn profile or another public profile")
    .option("--deep", "Return a deeper best-effort profile scrape")
    .option("--posts", "Return recent posts from the target profile instead of profile details")
    .option("--period <period>", "Filter recent posts by a relative window like 14d")
    .action((linkedinUrl, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const identifier = linkedinUrl ? parseLinkedInProfileIdentifier(linkedinUrl) : undefined;

          if (options.posts) {
            const posts = await api.getProfilePosts(identifier, {
              limit: context.limit ?? 10,
              periodDays: parsePeriodDays(options.period),
            });

            await outputForCommand(context, posts, {
              title: `${linkedinUrl ?? "My"} LinkedIn posts`,
              quietValue: posts.count,
              renderTable: () => printContentSearchResultsTable(posts.items),
            });
            return;
          }

          const deepProfile = options.deep ? await api.getDeepProfile(identifier) : undefined;
          const profile = deepProfile ?? (await api.getProfile(identifier));
          await outputForCommand(context, profile, {
            title: `${profile.fullName} LinkedIn profile`,
            quietValue: profile.profileUrl ?? profile.fullName,
            renderTable: () => {
              printProfileSummary(profile);

              if (profile.experience?.length) {
                console.log("");
                printExperienceTable(profile.experience.slice(0, 8));
              }

              if (profile.education?.length) {
                console.log("");
                printEducationTable(profile.education.slice(0, 8));
              }

              if (deepProfile) {
                const detailedProfile = deepProfile as DeepProfileSummary;

                if (detailedProfile.skills.length) {
                  console.log("");
                  printTable(
                    ["Skill", "Endorsements"],
                    detailedProfile.skills.slice(0, 12).map((skill) => [skill.name, skill.endorsementsCount]),
                  );
                }

                if (detailedProfile.featured.length) {
                  console.log("");
                  printTable(
                    ["Featured", "Type", "URL"],
                    detailedProfile.featured.slice(0, 8).map((item) => [item.title, item.type, item.url]),
                  );
                }

                console.log("");
                printKeyValue([
                  ["Posts in last 30 days", detailedProfile.activity.postsLast30Days],
                  ["Recommendations received", detailedProfile.recommendationsReceived.count],
                  ["Recommendations given", detailedProfile.recommendationsGiven.count],
                ]);
              }
            },
          });
        } finally {
          await close();
        }
      }),
    );
}
