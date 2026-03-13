#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const commandsDir = path.join(repoRoot, "src", "commands");
const skillPath = path.join(repoRoot, "docs", "skill.md");
const GROUP_ONLY_COMMANDS = new Set([
  "linkedin content",
  "linkedin jobs",
  "linkedin network",
  "linkedin search",
  "linkedin skill",
]);

function normalizeCommandSignature(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function getCliCommands() {
  const files = (await readdir(commandsDir)).filter((file) => file.endsWith(".ts"));
  const commands = new Set();

  for (const file of files) {
    const fullPath = path.join(commandsDir, file);
    const content = await readFile(fullPath, "utf8");

    const bases = new Map();
    for (const match of content.matchAll(/const\s+(\w+)\s*=\s*program\s*\.command\("([^"]+)"\)/g)) {
      bases.set(match[1], normalizeCommandSignature(match[2]));
      commands.add(`linkedin ${normalizeCommandSignature(match[2])}`);
    }

    for (const match of content.matchAll(/program\s*\.command\("([^"]+)"\)/g)) {
      commands.add(`linkedin ${normalizeCommandSignature(match[1])}`);
    }

    for (const [variable, base] of bases.entries()) {
      const pattern = new RegExp(`${variable}\\s*\\.command\\("([^"]+)"\\)`, "g");
      for (const match of content.matchAll(pattern)) {
        commands.add(`linkedin ${base} ${normalizeCommandSignature(match[1])}`);
      }
    }

    for (const match of content.matchAll(/registerPostCommand\("([^"]+)"/g)) {
      commands.add(`linkedin ${normalizeCommandSignature(match[1])} <postUrl>`);
    }

    for (const match of content.matchAll(/registerJobsBucket\(jobs,\s*"([^"]+)"/g)) {
      commands.add(`linkedin jobs ${normalizeCommandSignature(match[1])}`);
    }

    for (const match of content.matchAll(/registerSearchVertical\(search,\s*"([^"]+)"/g)) {
      commands.add(`linkedin search ${normalizeCommandSignature(match[1])} <query>`);
    }
  }

  return new Set(
    [...commands].filter((value) => !value.includes("linkedin jobs bucket") && !GROUP_ONLY_COMMANDS.has(value)),
  );
}

async function getSkillCommands() {
  const content = await readFile(skillPath, "utf8");
  const sectionMatch = content.match(/## Available Commands([\s\S]*?)## Natural Language Mappings/);
  if (!sectionMatch?.[1]) {
    throw new Error("docs/skill.md is missing the Available Commands section.");
  }

  const commands = new Set();
  for (const line of sectionMatch[1].split(/\r?\n/)) {
    const match = line.match(/^\s*linkedin\s+.+$/);
    if (match?.[0]) {
      commands.add(normalizeCommandSignature(match[0]));
    }
  }

  return commands;
}

async function main() {
  const cliCommands = await getCliCommands();
  const skillCommands = await getSkillCommands();

  const missingFromSkill = [...cliCommands].filter((command) => !skillCommands.has(command)).sort();
  const missingFromCli = [...skillCommands].filter((command) => !cliCommands.has(command)).sort();

  if (!missingFromSkill.length && !missingFromCli.length) {
    console.log("Skill validation passed.");
    return;
  }

  for (const command of missingFromSkill) {
    console.error(`SKILL DRIFT DETECTED: ${command} exists in CLI but is missing from docs/skill.md`);
  }

  for (const command of missingFromCli) {
    console.error(`SKILL DRIFT DETECTED: ${command} is documented in docs/skill.md but is missing from the CLI`);
  }

  process.exitCode = 1;
}

await main();
