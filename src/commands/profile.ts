import type { Command } from "commander";

import type { DeepProfileSummary } from "../api/types.js";
import { parseLinkedInProfileIdentifier } from "../api/voyager.js";
import { printJson } from "../output/json.js";
import {
  printEducationTable,
  printExperienceTable,
  printKeyValue,
  printProfileSummary,
  printTable,
} from "../output/table.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerProfileCommand(program: Command): void {
  program
    .command("profile [linkedinUrl]")
    .description("View your LinkedIn profile or another public profile")
    .option("--deep", "Return a deeper best-effort profile scrape")
    .action((linkedinUrl, options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const identifier = linkedinUrl ? parseLinkedInProfileIdentifier(linkedinUrl) : undefined;
          const deepProfile = options.deep ? await api.getDeepProfile(identifier) : undefined;
          const profile = deepProfile ?? (await api.getProfile(identifier));

          if (context.json) {
            printJson(profile);
            return;
          }

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
        } finally {
          await close();
        }
      }),
    );
}
