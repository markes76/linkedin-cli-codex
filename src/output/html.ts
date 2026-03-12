type Primitive = string | number | boolean | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is Primitive {
  return value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrimitive(value: Primitive): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return escapeHtml(String(value));
}

function visibleKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => key !== "raw");
}

function renderValue(value: unknown, depth = 2): string {
  if (isPrimitive(value)) {
    return `<p>${formatPrimitive(value)}</p>`;
  }

  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    if (records.length === value.length && records.length > 0) {
      const keys = [...new Set(records.flatMap((record) => visibleKeys(record)))];
      const header = keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
      const rows = records
        .map((record) =>
          `<tr>${keys
            .map((key) => `<td>${isPrimitive(record[key]) ? formatPrimitive(record[key]) : `<pre>${escapeHtml(JSON.stringify(record[key], null, 2))}</pre>`}</td>`)
            .join("")}</tr>`,
        )
        .join("");
      return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<ul>${value.map((item) => `<li>${renderValue(item, depth + 1)}</li>`).join("")}</ul>`;
  }

  if (isRecord(value)) {
    return visibleKeys(value)
      .map((key) => {
        const child = value[key];
        if (isPrimitive(child)) {
          return `<div class="kv"><strong>${escapeHtml(key)}</strong><span>${formatPrimitive(child)}</span></div>`;
        }

        const level = Math.min(depth, 6);
        return `<section><h${level}>${escapeHtml(key)}</h${level}>${renderValue(child, depth + 1)}</section>`;
      })
      .join("");
  }

  return `<pre>${escapeHtml(String(value))}</pre>`;
}

export function toHtmlDocument(value: unknown, title = "linkedin-cli report"): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --bg: #f7f4ee; --card: #fffdf9; --ink: #1f2430; --muted: #5e6a7c; --line: #d8d2c6; --accent: #1f6f5f; }
    body { margin: 0; font: 16px/1.5 Georgia, "Iowan Old Style", serif; background: linear-gradient(180deg, #f7f4ee, #efe8dc); color: var(--ink); }
    main { max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
    h1, h2, h3, h4, h5, h6 { font-family: "Avenir Next", "Segoe UI", sans-serif; letter-spacing: -0.02em; }
    h1 { margin-top: 0; font-size: 2.4rem; }
    section, table, .kv { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 30px rgba(31,36,48,0.05); }
    section { padding: 18px 20px; margin: 18px 0; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; margin: 18px 0; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; }
    th { background: #f1ece2; color: var(--accent); font-family: "Avenir Next", "Segoe UI", sans-serif; }
    tr:last-child td { border-bottom: none; }
    .kv { display: grid; grid-template-columns: 220px 1fr; gap: 16px; padding: 12px 16px; margin: 12px 0; }
    .kv strong { color: var(--accent); font-family: "Avenir Next", "Segoe UI", sans-serif; }
    ul { padding-left: 22px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${renderValue(value)}
  </main>
</body>
</html>`;
}
