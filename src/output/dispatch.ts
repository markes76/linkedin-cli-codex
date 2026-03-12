import { writeFile } from "node:fs/promises";

import clipboard from "clipboardy";

import type { CommandContext } from "../api/types.js";
import { CliError } from "../utils/errors.js";
import { toCsvAuto } from "./csv.js";
import { toHtmlDocument } from "./html.js";
import { stringifyJson } from "./json.js";
import { toMarkdown } from "./markdown.js";
import { captureOutput } from "./plain.js";

type QuietValue = string | number | boolean | null | undefined;

export interface OutputOptions<T> {
  title?: string;
  renderTable?: () => void | Promise<void>;
  quietValue?: QuietValue | (() => QuietValue);
}

function quietString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => quietString(item))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.count === "number" && Object.keys(record).length <= 2) {
      return String(record.count);
    }

    if (Array.isArray(record.items)) {
      const lines = record.items.map((item) => {
        if (!item || typeof item !== "object") {
          return quietString(item);
        }

        const entry = item as Record<string, unknown>;
        for (const key of ["fullName", "title", "text", "name", "url", "id"]) {
          if (typeof entry[key] === "string" || typeof entry[key] === "number") {
            return String(entry[key]);
          }
        }

        return stringifyJson(item, false);
      });

      return lines.filter(Boolean).join("\n");
    }

    for (const key of ["count", "fullName", "title", "text", "name", "url", "id"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") {
        return String(record[key]);
      }
    }
  }

  return stringifyJson(value, false);
}

async function resolveText<T>(context: CommandContext, payload: T, options: OutputOptions<T>): Promise<string> {
  if (context.quiet) {
    const value = typeof options.quietValue === "function" ? options.quietValue() : options.quietValue;
    return quietString(value ?? payload);
  }

  switch (context.format) {
    case "json":
      return stringifyJson(payload);
    case "csv":
      return toCsvAuto(payload);
    case "md":
      return toMarkdown(payload, options.title);
    case "html":
      return toHtmlDocument(payload, options.title);
    case "table":
      if (!options.renderTable) {
        throw new CliError("Table output is not available for this command.");
      }
      return captureOutput(options.renderTable);
    default:
      throw new CliError("Unsupported output format.");
  }
}

export async function outputResult<T>(context: CommandContext, payload: T, options: OutputOptions<T> = {}): Promise<void> {
  if (context.format === "table" && !context.output && !context.copy && !context.quiet) {
    if (!options.renderTable) {
      throw new CliError("Table output is not available for this command.");
    }

    await options.renderTable();
    return;
  }

  const text = await resolveText(context, payload, options);

  if (context.copy) {
    await clipboard.write(text);
  }

  if (context.output) {
    await writeFile(context.output, text, "utf8");
    if (!context.quiet) {
      console.log(context.copy ? `Output copied and written to ${context.output}` : `Output written to ${context.output}`);
    }
    return;
  }

  if (text) {
    process.stdout.write(`${text}${text.endsWith("\n") ? "" : "\n"}`);
  }
}
