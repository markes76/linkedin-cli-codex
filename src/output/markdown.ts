type Primitive = string | number | boolean | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is Primitive {
  return value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value);
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function formatPrimitive(value: Primitive): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function visibleKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => key !== "raw");
}

function renderTable(items: unknown[]): string | undefined {
  const records = items.filter(isRecord);
  if (!records.length) {
    return undefined;
  }

  const keys = [...new Set(records.flatMap((item) => visibleKeys(item)))];
  if (!keys.length) {
    return undefined;
  }

  const header = `| ${keys.map(escapePipes).join(" | ")} |`;
  const divider = `| ${keys.map(() => "---").join(" | ")} |`;
  const rows = records.map((record) =>
    `| ${keys.map((key) => escapePipes(formatPrimitive(isPrimitive(record[key]) ? record[key] : JSON.stringify(record[key])))).join(" | ")} |`,
  );

  return [header, divider, ...rows].join("\n");
}

function renderValue(value: unknown, headingLevel: number): string {
  if (isPrimitive(value)) {
    return formatPrimitive(value);
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return "_Empty_";
    }

    const table = renderTable(value);
    if (table) {
      return table;
    }

    return value.map((item) => `- ${renderValue(item, headingLevel + 1).replace(/\n/g, " ")}`).join("\n");
  }

  if (isRecord(value)) {
    const sections = visibleKeys(value).map((key) => {
      const child = value[key];
      if (isPrimitive(child)) {
        return `- **${key}**: ${formatPrimitive(child)}`;
      }

      const heading = `${"#".repeat(Math.min(headingLevel, 6))} ${key}`;
      return `${heading}\n${renderValue(child, headingLevel + 1)}`;
    });

    return sections.join("\n\n");
  }

  return String(value);
}

export function toMarkdown(value: unknown, title = "linkedin-cli"): string {
  return `# ${title}\n\n${renderValue(value, 2)}`.trimEnd();
}
