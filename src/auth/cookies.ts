import type { SessionData } from "../api/types.js";

interface CookieLike {
  name: string;
  value: string;
}

export function normalizeJSession(jsessionId: string): string {
  return jsessionId.replace(/^"+|"+$/g, "");
}

export function buildCookieHeader(session: SessionData): string {
  return `li_at=${session.liAt}; JSESSIONID=${session.jsessionId}`;
}

export function buildCsrfToken(session: SessionData): string {
  return normalizeJSession(session.jsessionId);
}

export function extractSessionFromCookies(cookies: CookieLike[]): SessionData {
  const liAt = cookies.find((cookie) => cookie.name === "li_at")?.value;
  const jsessionId = cookies.find((cookie) => cookie.name === "JSESSIONID")?.value;

  if (!liAt || !jsessionId) {
    throw new Error("LinkedIn login completed, but the required session cookies were not found.");
  }

  return {
    liAt,
    jsessionId,
    savedAt: new Date().toISOString(),
    source: "playwright",
  };
}

