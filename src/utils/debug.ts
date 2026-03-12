const DEBUG_ENABLED = process.env.LINKEDIN_CLI_DEBUG === "1";

export function debugLog(scope: string, message: string): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.error(`[linkedin-cli][${timestamp}][${scope}] ${message}`);
}

export async function debugStep<T>(scope: string, message: string, action: () => Promise<T>): Promise<T> {
  debugLog(scope, `${message} (start)`);
  try {
    const result = await action();
    debugLog(scope, `${message} (ok)`);
    return result;
  } catch (error) {
    debugLog(scope, `${message} (error: ${error instanceof Error ? error.message : String(error)})`);
    throw error;
  }
}

