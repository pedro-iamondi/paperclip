import pc from "picocolors";

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  // Tenta parsear como JSON para processar os TranscriptEntry estruturados
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // Se nao for JSON, apenas imprime a linha (fallback para logs nao estruturados)
    console.log(line);
    return;
  }

  const kind = typeof parsed.kind === "string" ? parsed.kind : "";

  switch (kind) {
    case "init": {
      const model = typeof parsed.model === "string" ? parsed.model : "unknown";
      const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : "";
      console.log(pc.blue(`OpenRouter initialized (model: ${model}${sessionId ? `, session: ${sessionId}` : ""})`));
      break;
    }
    case "system": {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      if (text) console.log(pc.blue(`system: ${text}`));
      break;
    }
    case "assistant": {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      if (text) {
        // Se for delta (streaming), escreve direto sem newline automatico
        if (parsed.delta === true) {
          process.stdout.write(pc.green(text));
        } else {
          console.log(pc.green(`assistant: ${text}`));
        }
      }
      break;
    }
    case "thinking": {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      if (text) {
        if (parsed.delta === true) {
          process.stdout.write(pc.gray(text));
        } else {
          console.log(pc.gray(`thinking: ${text}`));
        }
      }
      break;
    }
    case "tool_call": {
      const name = typeof parsed.name === "string" ? parsed.name : "unknown";
      console.log(pc.yellow(`tool_call: ${name}`));
      if (parsed.input !== undefined) {
        console.log(pc.gray(stringifyUnknown(parsed.input)));
      }
      break;
    }
    case "tool_result": {
      const isError = parsed.isError === true;
      const content = typeof parsed.content === "string" ? parsed.content : "";
      console.log((isError ? pc.red : pc.cyan)(`tool_result${isError ? " (error)" : ""}`));
      if (content) {
        console.log((isError ? pc.red : pc.gray)(content));
      }
      break;
    }
    case "result": {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      if (text) {
        console.log(pc.green("result:"));
        console.log(text);
      }
      const input = Number(parsed.inputTokens ?? 0);
      const output = Number(parsed.outputTokens ?? 0);
      const cached = Number(parsed.cachedTokens ?? 0);
      const cost = Number(parsed.costUsd ?? 0);
      console.log(
        pc.blue(
          `tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`,
        ),
      );
      break;
    }
    case "stderr": {
      const text = typeof parsed.text === "string" ? parsed.text : "";
      if (text) {
        console.log(pc.red(`stderr: ${text}`));
      }
      break;
    }
    default: {
      if (debug) {
        console.log(pc.gray(line));
      }
      break;
    }
  }
}

export function formatRunSummary(result: {
  success: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  metadata?: Record<string, unknown>;
}): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push("✅ OpenRouter run completed");
  } else {
    lines.push("❌ OpenRouter run failed");
  }

  if (result.metadata?.model) {
    lines.push(`   Model: ${result.metadata.model}`);
  }

  if (result.usage) {
    lines.push(
      `   Tokens: ${result.usage.inputTokens.toLocaleString()} in / ${result.usage.outputTokens.toLocaleString()} out`
    );
    if (result.usage.costUsd > 0) {
      lines.push(`   Cost: $${result.usage.costUsd.toFixed(6)}`);
    } else {
      lines.push("   Cost: $0.00 (free model)");
    }
  }

  return lines.join("\n");
}
