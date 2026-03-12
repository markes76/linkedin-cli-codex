import { writeFile } from "node:fs/promises";

import { stringify } from "csv-stringify/sync";
import { CliError } from "../utils/errors.js";

export function toCsv(columns: string[], rows: Array<Record<string, string | number | undefined>>): string {
  return stringify(rows, {
    header: true,
    columns,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flattenRecord(
  value: Record<string, unknown>,
  prefix = "",
  target: Record<string, string | number | undefined> = {},
): Record<string, string | number | undefined> {
  for (const [key, nested] of Object.entries(value)) {
    if (key === "raw") {
      continue;
    }

    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (nested === null || nested === undefined) {
      target[fullKey] = undefined;
      continue;
    }

    if (typeof nested === "string" || typeof nested === "number") {
      target[fullKey] = nested;
      continue;
    }

    if (typeof nested === "boolean") {
      target[fullKey] = nested ? "true" : "false";
      continue;
    }

    if (Array.isArray(nested)) {
      target[fullKey] = nested.every((item) => typeof item !== "object")
        ? nested.map((item) => String(item)).join("; ")
        : JSON.stringify(nested);
      continue;
    }

    if (isRecord(nested)) {
      flattenRecord(nested, fullKey, target);
      continue;
    }

    target[fullKey] = String(nested);
  }

  return target;
}

export function toCsvAuto(value: unknown): string {
  let rows: Array<Record<string, string | number | undefined>>;

  if (Array.isArray(value)) {
    rows = value.filter(isRecord).map((item) => flattenRecord(item));
  } else if (isRecord(value) && Array.isArray(value.items)) {
    rows = value.items.filter(isRecord).map((item) => flattenRecord(item));
  } else if (isRecord(value)) {
    rows = [flattenRecord(value)];
  } else {
    throw new CliError("CSV output is only supported for object or list results.");
  }

  if (!rows.length) {
    return "";
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return toCsv(columns, rows);
}

export async function writeCsvFile(
  filepath: string,
  columns: string[],
  rows: Array<Record<string, string | number | undefined>>,
): Promise<void> {
  await writeFile(filepath, toCsv(columns, rows), "utf8");
}
