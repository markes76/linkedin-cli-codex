import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const APP_NAME = "linkedin-cli";
export const VERSION = "0.1.0";

export const CONFIG_DIR = path.join(os.homedir(), ".config", APP_NAME);
export const SESSION_FILE = path.join(CONFIG_DIR, "session.json");
export const BROWSER_PROFILE_DIR = path.join(CONFIG_DIR, "browser-profile");
export const CONFIG_SKILL_FILE = path.join(CONFIG_DIR, "skill.md");

export const CLAUDE_SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
export const CLAUDE_SKILL_FILE = path.join(CLAUDE_SKILLS_DIR, "linkedin-cli.md");

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export async function ensureBrowserProfileDir(): Promise<void> {
  await mkdir(BROWSER_PROFILE_DIR, { recursive: true, mode: 0o700 });
}

export async function ensureClaudeSkillDir(): Promise<void> {
  await mkdir(CLAUDE_SKILLS_DIR, { recursive: true, mode: 0o700 });
}
