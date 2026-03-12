import process from "node:process";

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class MissingSessionError extends CliError {
  constructor() {
    super("No saved LinkedIn session found. Run `linkedin login` first.");
  }
}

export class LinkedInAuthError extends CliError {
  constructor(message = "Your LinkedIn session is invalid or expired. Run `linkedin login` again.") {
    super(message, 1);
  }
}

export class LinkedInRateLimitError extends CliError {
  constructor(message = "LinkedIn is rate limiting requests right now. Wait a minute and try again.") {
    super(message, 1);
  }
}

export class LinkedInApiError extends CliError {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message, 1);
    this.status = status;
    this.body = body;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof CliError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

export async function runCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

