import { Command } from "commander";

import { registerAnalyticsCommand } from "./commands/analytics.js";
import { registerCompanyCommand } from "./commands/company.js";
import { registerConnectionsCommand } from "./commands/connections.js";
import { registerContentCommand } from "./commands/content.js";
import { registerFeedCommand } from "./commands/feed.js";
import { registerJobsCommand } from "./commands/jobs.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerMessagesCommand } from "./commands/messages.js";
import { registerNetworkCommand } from "./commands/network.js";
import { registerNotificationsCommand } from "./commands/notifications.js";
import { registerProfileCommand } from "./commands/profile.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerSkillCommand } from "./commands/skill.js";
import { registerStatusCommand } from "./commands/status.js";
import { setColorEnabled } from "./output/colors.js";
import { VERSION } from "./utils/config.js";

const program = new Command();

program
  .name("linkedin")
  .description("Unofficial LinkedIn CLI for agentic coding tools")
  .version(VERSION)
  .option("--json", "Output structured JSON")
  .option("--csv", "Output CSV when the command supports flat export")
  .option("--md", "Output Markdown")
  .option("--html", "Output HTML")
  .option("--output <filepath>", "Write output to a file and infer format from the extension when possible")
  .option("--copy", "Copy the rendered output to the system clipboard")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("--no-color", "Disable colored output")
  .option("--limit <number>", "Limit the number of results returned", (value) => Number.parseInt(value, 10))
  .showHelpAfterError();

program.hook("preAction", (command) => {
  const options = command.optsWithGlobals<{ color?: boolean }>();
  setColorEnabled(options.color ?? true);
});

registerLoginCommand(program);
registerStatusCommand(program);
registerLogoutCommand(program);
registerProfileCommand(program);
registerCompanyCommand(program);
registerConnectionsCommand(program);
registerContentCommand(program);
registerFeedCommand(program);
registerMessagesCommand(program);
registerNotificationsCommand(program);
registerNetworkCommand(program);
registerAnalyticsCommand(program);
registerSearchCommand(program);
registerJobsCommand(program);
registerSkillCommand(program);

await program.parseAsync(process.argv);
