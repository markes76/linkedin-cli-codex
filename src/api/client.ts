import { setTimeout as delay } from "node:timers/promises";

import type { SessionData } from "./types.js";
import { buildCookieHeader, buildCsrfToken } from "../auth/cookies.js";
import { captureSessionFromContext, ensureLinkedInPage, getLinkedInCookies, launchLinkedInContext } from "../auth/browser.js";
import { writeSession } from "../auth/session.js";
import { LinkedInApiError, LinkedInAuthError, LinkedInRateLimitError } from "../utils/errors.js";
import type { BrowserContext, Page } from "playwright";
import { debugLog, debugStep } from "../utils/debug.js";

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface VoyagerClientOptions {
  delayMs?: number;
  transport?: "browser" | "http";
}

export class VoyagerClient {
  static readonly BASE_URL = "https://www.linkedin.com/voyager/api";

  private readonly delayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly transport: "browser" | "http";
  private lastRequestAt = 0;
  private browserContext?: BrowserContext;

  constructor(
    private readonly session: SessionData,
    options: VoyagerClientOptions = {},
  ) {
    const envDelay = Number.parseInt(process.env.LINKEDIN_CLI_DELAY_MS ?? "", 10);
    const envTimeout = Number.parseInt(process.env.LINKEDIN_CLI_REQUEST_TIMEOUT_MS ?? "", 10);
    this.delayMs = Number.isFinite(envDelay) ? envDelay : options.delayMs ?? 1200;
    this.requestTimeoutMs = Number.isFinite(envTimeout) ? envTimeout : 15000;
    this.transport = (process.env.LINKEDIN_CLI_TRANSPORT as "browser" | "http" | undefined) ?? options.transport ?? "browser";
  }

  async getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    debugLog("client", `getJson ${path} via ${this.transport}`);
    return this.transport === "browser" ? this.getJsonWithBrowser(path, options) : this.getJsonWithHttp(path, options);
  }

  async openPage(targetUrl: string): Promise<Page> {
    await this.respectRateLimit();
    const context = await debugStep("client", "get browser context for page", () => this.getBrowserContext());
    const page = await debugStep("client", `open page ${targetUrl}`, () => ensureLinkedInPage(context, targetUrl));
    this.lastRequestAt = Date.now();
    return page;
  }

  async close(): Promise<void> {
    if (!this.browserContext) {
      return;
    }

    try {
      await debugStep("client", "sync session from browser during close", () => this.syncSessionFromBrowser());
    } finally {
      await debugStep("client", "close browser context", () => this.browserContext!.close());
      this.browserContext = undefined;
    }
  }

  private async getJsonWithHttp<T>(path: string, options: RequestOptions = {}): Promise<T> {
    await this.respectRateLimit();

    const url = new URL(`${VoyagerClient.BASE_URL}${path}`);

    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        cookie: buildCookieHeader(this.session),
        "csrf-token": buildCsrfToken(this.session),
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "x-li-lang": "en_US",
        "x-restli-protocol-version": "2.0.0",
        ...options.headers,
      },
    });

    this.lastRequestAt = Date.now();

    if (!response.ok) {
      await this.throwForResponse(response);
    }

    return (await response.json()) as T;
  }

  private async getJsonWithBrowser<T>(path: string, options: RequestOptions = {}): Promise<T> {
    await this.respectRateLimit();

    const context = await debugStep("client", "get browser context", () => this.getBrowserContext());
    const url = new URL(`${VoyagerClient.BASE_URL}${path}`);

    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const cookies = await debugStep("client", "fetch cookies from browser context", () => getLinkedInCookies(context));
    const currentJSession = cookies.find((cookie) => cookie.name === "JSESSIONID")?.value ?? this.session.jsessionId;

    let response;
    try {
      response = await debugStep("client", `browser request GET ${url.pathname}`, () =>
        context.request.get(url.toString(), {
          headers: {
            accept: "application/json",
            "csrf-token": currentJSession.replace(/^"+|"+$/g, ""),
            "x-li-lang": "en_US",
            "x-restli-protocol-version": "2.0.0",
            ...options.headers,
          },
          timeout: this.requestTimeoutMs,
        }),
      );
    } catch (error) {
      if (error instanceof Error && /timed out/i.test(error.message)) {
        throw new LinkedInApiError(408, `LinkedIn browser-backed request timed out after ${this.requestTimeoutMs}ms.`, error.message);
      }

      throw error;
    }

    const payload = {
      body: await response.text(),
      contentType: response.headers()["content-type"],
      status: response.status(),
      url: response.url(),
    };

    this.lastRequestAt = Date.now();

    if (payload.url.includes("/login")) {
      throw new LinkedInAuthError();
    }

    if (payload.status < 200 || payload.status >= 300) {
      await this.throwForPayload(payload.status, payload.body);
    }

    if (!payload.contentType?.includes("json")) {
      throw new LinkedInApiError(payload.status, "LinkedIn returned a non-JSON response for a Voyager request.", payload.body);
    }

    await debugStep("client", "sync session from browser after request", () => this.syncSessionFromBrowser());

    try {
      return JSON.parse(payload.body) as T;
    } catch {
      throw new LinkedInApiError(payload.status, "LinkedIn returned malformed JSON.", payload.body);
    }
  }

  private async respectRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;

    if (this.lastRequestAt > 0 && elapsed < this.delayMs) {
      await delay(this.delayMs - elapsed);
    }
  }

  private async getBrowserContext(): Promise<BrowserContext> {
    if (!this.browserContext) {
      const headful = process.env.LINKEDIN_CLI_BROWSER_HEADFUL === "1";
      this.browserContext = await launchLinkedInContext(!headful);
    }

    return this.browserContext;
  }

  private async syncSessionFromBrowser(): Promise<void> {
    if (!this.browserContext) {
      return;
    }

    try {
      await writeSession(await captureSessionFromContext(this.browserContext));
    } catch {
      // Best-effort sync so the browser-backed transport can keep running
    }
  }

  private async throwForPayload(status: number, body: string): Promise<never> {
    let parsedBody: unknown = body;

    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }

    if (status === 401) {
      throw new LinkedInAuthError();
    }

    if (status === 403 || status === 429) {
      throw new LinkedInRateLimitError();
    }

    throw new LinkedInApiError(status, `LinkedIn request failed with status ${status}.`, parsedBody);
  }

  private async throwForResponse(response: Response): Promise<never> {
    const body = await response.text();
    let parsedBody: unknown = body;

    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }

    if (response.status === 401) {
      throw new LinkedInAuthError();
    }

    if (response.status === 403 || response.status === 429) {
      throw new LinkedInRateLimitError();
    }

    throw new LinkedInApiError(response.status, `LinkedIn request failed with status ${response.status}.`, parsedBody);
  }
}
