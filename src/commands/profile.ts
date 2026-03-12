import type { Command } from "commander";

import { parseLinkedInProfileIdentifier } from "../api/voyager.js";
import { printJson } from "../output/json.js";
import { printKeyValue, printTable } from "../output/table.js";
import { runCommand } from "../utils/errors.js";
import { getApiForCommand } from "./support.js";

export function registerProfileCommand(program: Command): void {
  program
    .command("profile [linkedinUrl]")
    .description("View your LinkedIn profile or another public profile")
    .action((linkedinUrl, _options, command) =>
      runCommand(async () => {
        const { context, api, close } = await getApiForCommand(command);
        try {
          const profile = await api.getProfile(linkedinUrl ? parseLinkedInProfileIdentifier(linkedinUrl) : undefined);

          if (context.json) {
            printJson(profile);
            return;
          }

          printKeyValue([
            ["Full name", profile.fullName],
            ["Headline", profile.headline],
            ["Summary", profile.summary],
            ["Location", profile.location],
            ["Industry", profile.industry],
            ["Profile URL", profile.profileUrl],
            ["Followers", profile.followers],
            ["Connections", profile.connections],
          ]);

          if (profile.experience?.length) {
            console.log("");
            printTable(
              ["Experience", "Company", "Location", "Dates"],
              profile.experience.slice(0, 5).map((experience) => [
                experience.title,
                experience.company,
                experience.location,
                [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
              ]),
            );
          }
        } finally {
          await close();
        }
      }),
    );
}
