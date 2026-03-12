import { chromium } from "playwright";

import type { SessionData } from "../api/types.js";
import { extractSessionFromCookies } from "./cookies.js";
import { BROWSER_PROFILE_DIR, ensureBrowserProfileDir, ensureConfigDir } from "../utils/config.js";
import { CliError } from "../utils/errors.js";

const LOGIN_URL = "https://www.linkedin.com/login";
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const COOKIE_POLL_INTERVAL_MS = 1500;

async function waitForSessionCookies(context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>): Promise<SessionData> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const cookies = await context.cookies("https://www.linkedin.com");
    const hasLiAt = cookies.some((cookie) => cookie.name === "li_at" && cookie.value);
    const hasJSessionId = cookies.some((cookie) => cookie.name === "JSESSIONID" && cookie.value);

    if (hasLiAt && hasJSessionId) {
      return extractSessionFromCookies(cookies);
    }

    await context.pages()[0]?.waitForTimeout(COOKIE_POLL_INTERVAL_MS);
  }

  throw new CliError("Timed out waiting for LinkedIn login to finish. Please run `linkedin login` and complete sign-in again.");
}

export async function loginWithBrowser(): Promise<SessionData> {
  await ensureConfigDir();
  await ensureBrowserProfileDir();

  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;

  try {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--start-maximized",
      ],
    });
  } catch (error) {
    throw new CliError(
      `Unable to launch Google Chrome through Playwright. Install Chrome and, if needed, run \`npm run browsers:install\`. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  console.log("A Chrome window has been opened for LinkedIn login.");
  console.log("Complete sign-in, including any MFA prompts. The CLI will save your session automatically once LinkedIn finishes loading.");

  try {
    const session = await waitForSessionCookies(context);
    return session;
  } finally {
    await context.close();
  }
}

