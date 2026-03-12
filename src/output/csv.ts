import { writeFile } from "node:fs/promises";

import { stringify } from "csv-stringify/sync";

export function toCsv(columns: string[], rows: Array<Record<string, string | number | undefined>>): string {
  return stringify(rows, {
    header: true,
    columns,
  });
}

export async function writeCsvFile(
  filepath: string,
  columns: string[],
  rows: Array<Record<string, string | number | undefined>>,
): Promise<void> {
  await writeFile(filepath, toCsv(columns, rows), "utf8");
}
