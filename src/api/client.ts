import { setTimeout as delay } from "node:timers/promises";

import type { SessionData } from "./types.js";
import { buildCookieHeader, buildCsrfToken } from "../auth/cookies.js";
import { LinkedInApiError, LinkedInAuthError, LinkedInRateLimitError } from "../utils/errors.js";

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface VoyagerClientOptions {
  delayMs?: number;
}

export class VoyagerClient {
  static readonly BASE_URL = "https://www.linkedin.com/voyager/api";

  private readonly delayMs: number;
  private lastRequestAt = 0;

  constructor(
    private readonly session: SessionData,
    options: VoyagerClientOptions = {},
  ) {
    const envDelay = Number.parseInt(process.env.LINKEDIN_CLI_DELAY_MS ?? "", 10);
    this.delayMs = Number.isFinite(envDelay) ? envDelay : options.delayMs ?? 1200;
  }

  async getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  private async respectRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;

    if (this.lastRequestAt > 0 && elapsed < this.delayMs) {
      await delay(this.delayMs - elapsed);
    }
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

