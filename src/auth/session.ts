import { chmod, readFile, rm, writeFile } from "node:fs/promises";

import type { SessionData } from "../api/types.js";
import { MissingSessionError } from "../utils/errors.js";
import { SESSION_FILE, ensureConfigDir } from "../utils/config.js";

function isSessionData(value: unknown): value is SessionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SessionData>;
  return (
    typeof candidate.liAt === "string" &&
    typeof candidate.jsessionId === "string" &&
    typeof candidate.savedAt === "string" &&
    candidate.source === "playwright"
  );
}

export async function readSession(): Promise<SessionData | null> {
  try {
    const content = await readFile(SESSION_FILE, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return isSessionData(parsed) ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function requireSession(): Promise<SessionData> {
  const session = await readSession();

  if (!session) {
    throw new MissingSessionError();
  }

  return session;
}

export async function writeSession(session: SessionData): Promise<void> {
  await ensureConfigDir();
  await writeFile(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(SESSION_FILE, 0o600);
}

export async function clearSession(): Promise<boolean> {
  try {
    await rm(SESSION_FILE, { force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

