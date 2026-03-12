import { Chalk } from "chalk";

let chalkInstance = new Chalk({ level: 1 });

export function setColorEnabled(enabled: boolean): void {
  chalkInstance = new Chalk({ level: enabled ? 1 : 0 });
}

export const theme = {
  info: (value: string): string => chalkInstance.cyan(value),
  success: (value: string): string => chalkInstance.green(value),
  warning: (value: string): string => chalkInstance.yellow(value),
  error: (value: string): string => chalkInstance.red(value),
  muted: (value: string): string => chalkInstance.gray(value),
  header: (value: string): string => chalkInstance.bold.white(value),
  accent: (value: string): string => chalkInstance.blueBright(value),
};

