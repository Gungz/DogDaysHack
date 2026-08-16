const ENABLED =
  (process.env.DEBUG || "").includes("dogevault") || process.env.LOG_LEVEL === "debug";

function truncate(value: unknown, max = 2000): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}

/**
 * Logs an API step's input and output. Only emits when DEBUG=dogevers (or LOG_LEVEL=debug)
 * so production stays quiet.
 */
export function debugStep(name: string, input?: unknown, output?: unknown): void {
  if (!ENABLED) return;
  const ts = new Date().toISOString();
  console.log(`[dogevault:debug] ${ts} ${name}`);
  if (input !== undefined) console.log("  input:", truncate(input));
  if (output !== undefined) console.log("  output:", truncate(output));
}

export function isDebugEnabled(): boolean {
  return ENABLED;
}
