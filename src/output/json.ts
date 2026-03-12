export function stringifyJson(value: unknown, pretty = true): string {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export function printJson(value: unknown): void {
  console.log(stringifyJson(value));
}
