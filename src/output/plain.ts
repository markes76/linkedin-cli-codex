export async function captureOutput(render: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalLog = console.log;
  const originalWrite = process.stdout.write.bind(process.stdout);

  console.log = (...args: unknown[]) => {
    chunks.push(`${args.map((arg) => String(arg)).join(" ")}\n`);
  };

  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await render();
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }

  return chunks.join("").trimEnd();
}
