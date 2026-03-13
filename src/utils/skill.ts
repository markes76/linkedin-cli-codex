import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { CLAUDE_SKILL_FILE, CONFIG_SKILL_FILE, ensureClaudeSkillDir, ensureConfigDir } from "./config.js";

export interface SkillMetadata {
  skillVersion: string;
  lastUpdated: string;
  cliVersionCompatible: string;
}

export interface SkillTargetStatus {
  key: "config" | "claude";
  label: string;
  path: string;
  installed: boolean;
  hash?: string;
  matchesRepo?: boolean;
  metadata?: SkillMetadata;
}

export function parseSkillMetadata(content: string): SkillMetadata {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!match?.[1]) {
    throw new Error("Skill file is missing required frontmatter metadata.");
  }

  const data = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([a-z_]+):\s*"([^"]+)"\s*$/i);
    if (entry?.[1] && entry[2]) {
      data.set(entry[1], entry[2]);
    }
  }

  const skillVersion = data.get("skill_version");
  const lastUpdated = data.get("last_updated");
  const cliVersionCompatible = data.get("cli_version_compatible");

  if (!skillVersion || !lastUpdated || !cliVersionCompatible) {
    throw new Error("Skill file frontmatter must include skill_version, last_updated, and cli_version_compatible.");
  }

  return {
    skillVersion,
    lastUpdated,
    cliVersionCompatible,
  };
}

export function hashSkill(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function readRepoSkill(): Promise<{ content: string; hash: string; metadata: SkillMetadata }> {
  const file = new URL("../docs/skill.md", import.meta.url);
  const content = await readFile(file, "utf8");
  return {
    content,
    hash: hashSkill(content),
    metadata: parseSkillMetadata(content),
  };
}

async function readInstalledSkill(path: string): Promise<{ content: string; hash: string; metadata: SkillMetadata } | null> {
  try {
    const content = await readFile(path, "utf8");
    return {
      content,
      hash: hashSkill(content),
      metadata: parseSkillMetadata(content),
    };
  } catch {
    return null;
  }
}

export async function installSkillTargets(content: string): Promise<SkillTargetStatus[]> {
  await ensureConfigDir();
  await ensureClaudeSkillDir();

  await writeFile(CONFIG_SKILL_FILE, content, "utf8");
  await chmod(CONFIG_SKILL_FILE, 0o600);
  await writeFile(CLAUDE_SKILL_FILE, content, "utf8");
  await chmod(CLAUDE_SKILL_FILE, 0o600);

  return getInstalledSkillStatuses(hashSkill(content));
}

export async function getInstalledSkillStatuses(repoHash?: string): Promise<SkillTargetStatus[]> {
  const targets = [
    { key: "config" as const, label: "Config", path: CONFIG_SKILL_FILE },
    { key: "claude" as const, label: "Claude Code", path: CLAUDE_SKILL_FILE },
  ];

  return Promise.all(
    targets.map(async (target) => {
      const installed = await readInstalledSkill(target.path);
      return {
        key: target.key,
        label: target.label,
        path: target.path,
        installed: Boolean(installed),
        hash: installed?.hash,
        matchesRepo: installed ? installed.hash === repoHash : false,
        metadata: installed?.metadata,
      } satisfies SkillTargetStatus;
    }),
  );
}

export async function hasInstalledSkill(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
