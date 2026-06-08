import type { TranscriptEntry } from "../types";

export function parseOpenRouterStdoutLine(line: string, ts: string): TranscriptEntry[] {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && typeof parsed.kind === "string") {
      return [parsed as TranscriptEntry];
    }
  } catch {
    // ignore JSON parsing errors, fall back to raw stdout
  }
  return [{ kind: "stdout", ts, text: line }];
}
