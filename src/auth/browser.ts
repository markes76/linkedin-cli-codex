import { chromium } from "playwright";
import type { BrowserContext, Cookie, Page } from "playwright";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { SessionData } from "../api/types.js";
import { extractSessionFromCookies } from "./cookies.js";
import { BROWSER_PROFILE_DIR, ensureBrowserProfileDir, ensureConfigDir } from "../utils/config.js";
import { CliError } from "../utils/errors.js";
import { debugLog, debugStep } from "../utils/debug.js";

const LOGIN_URL = "https://www.linkedin.com/login";
const APP_URL = "https://www.linkedin.com/";
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const COOKIE_POLL_INTERVAL_MS = 1500;
const BROWSER_STEP_TIMEOUT_MS = 15000;

type PersistentContextOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

function buildContextOptions(headless: boolean): PersistentContextOptions {
  return {
    headless,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--start-maximized",
    ],
    ...(headless ? {} : { channel: "chrome" }),
  };
}

async function applyStealthInitScript(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });
}

async function clearStaleProfileLocks(): Promise<void> {
  const entries = await readdir(BROWSER_PROFILE_DIR, { withFileTypes: true }).catch(() => []);
  const lockNames = entries
    .filter((entry) => entry.name.startsWith("Singleton"))
    .map((entry) => path.join(BROWSER_PROFILE_DIR, entry.name));

  for (const lockPath of lockNames) {
    await rm(lockPath, { force: true, recursive: true }).catch(() => {});
    debugLog("browser", `removed stale profile lock ${lockPath}`);
  }
}

export async function launchLinkedInContext(headless: boolean): Promise<BrowserContext> {
  await ensureConfigDir();
  await ensureBrowserProfileDir();
  await debugStep("browser", "clear stale profile locks", () => clearStaleProfileLocks());
  const browserLabel = headless ? "Chromium" : "Google Chrome";
  debugLog("browser", `launching persistent ${browserLabel} context (headless=${String(headless)})`);

  try {
    const context = await withBrowserStepTimeout(
      debugStep("browser", "launchPersistentContext", () =>
        chromium.launchPersistentContext(BROWSER_PROFILE_DIR, buildContextOptions(headless)),
      ),
      "Launching the LinkedIn browser context timed out.",
    );
    await debugStep("browser", "apply stealth init script", () => applyStealthInitScript(context));
    return context;
  } catch (error) {
    throw new CliError(
      `Unable to launch the LinkedIn browser context through Playwright. For interactive login, install Google Chrome. For headless requests, if needed run \`npm run browsers:install\`. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
}

export async function ensureLinkedInPage(context: BrowserContext, targetUrl = APP_URL): Promise<Page> {
  const page =
    context.pages().find((candidate) => !candidate.isClosed()) ??
    (await debugStep("browser", "create new page", () => context.newPage()));

  const currentUrl = page.url().split("#")[0];
  const desiredUrl = targetUrl.split("#")[0];

  if (currentUrl !== desiredUrl) {
    await withBrowserStepTimeout(
      debugStep("browser", `goto ${targetUrl}`, () => page.goto(targetUrl, { waitUntil: "domcontentloaded" })),
      `Opening ${targetUrl} timed out.`,
    );
  }

  return page;
}

export async function getLinkedInCookies(context: BrowserContext): Promise<Cookie[]> {
  return withBrowserStepTimeout(
    debugStep("browser", "read LinkedIn cookies", () => context.cookies("https://www.linkedin.com")),
    "Reading LinkedIn cookies from the browser context timed out.",
  );
}

export async function captureSessionFromContext(context: BrowserContext): Promise<SessionData> {
  return extractSessionFromCookies(await getLinkedInCookies(context));
}

export async function resetLinkedInBrowserProfile(): Promise<void> {
  await rm(BROWSER_PROFILE_DIR, { recursive: true, force: true });
  await mkdir(BROWSER_PROFILE_DIR, { recursive: true, mode: 0o700 });
}

async function waitForSessionCookies(context: BrowserContext): Promise<SessionData> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const cookies = await getLinkedInCookies(context);
    const hasLiAt = cookies.some((cookie) => cookie.name === "li_at" && cookie.value);
    const hasJSessionId = cookies.some((cookie) => cookie.name === "JSESSIONID" && cookie.value);

    if (hasLiAt && hasJSessionId) {
      return extractSessionFromCookies(cookies);
    }

    await delay(COOKIE_POLL_INTERVAL_MS);
  }

  throw new CliError("Timed out waiting for LinkedIn login to finish. Please run `linkedin login` and complete sign-in again.");
}

export async function loginWithBrowser(): Promise<SessionData> {
  const context = await launchLinkedInContext(false);
  const page = await ensureLinkedInPage(context, LOGIN_URL);
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

async function withBrowserStepTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    delay(BROWSER_STEP_TIMEOUT_MS).then(() => {
      throw new CliError(message);
    }),
  ]);
}
