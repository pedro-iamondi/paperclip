/**
 * Server barrel for the OpenRouter adapter.
 *
 * Exposes everything Paperclip's server-side registry expects from a
 * fully-featured adapter:
 *   - execute             — the agent run loop (tool-calling)
 *   - testEnvironment     — env diagnostics + model fetch
 *   - sessionCodec        — persist/restore lastGenerationId across heartbeats
 *   - detectModel         — read OPENROUTER_MODEL env if present
 *   - listSkills          — minimal stub (filesystem scan)
 *   - syncSkills          — no-op (skills are managed externally)
 *
 * Optional hooks not implemented (deferred to v3):
 *   - getQuotaWindows     — OpenRouter exposes /key endpoint, can be added
 *   - onHireApproved      — only used by cloud adapters
 *   - getConfigSchema     — UI form fields are still declared in src/ui/build-config.ts
 */

import path from "node:path";
import fs from "node:fs/promises";
import type {
  AdapterSessionCodec,
  AdapterSkillContext,
  AdapterSkillSnapshot,
  AdapterConfigSchema,
} from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment, listOpenRouterModels } from "./test.js";

// ----- sessionCodec -----

/**
 * OpenRouter doesn't have first-class server-side sessions; we persist the
 * last generation id so the run viewer can show a stable display id and
 * future versions can chain conversations across heartbeats.
 */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.lastGenerationId === "string" ? obj.lastGenerationId : null;
    if (!id) return null;
    return { lastGenerationId: id };
  },
  serialize(params) {
    if (!params || typeof params !== "object") return null;
    const id = typeof params.lastGenerationId === "string" ? params.lastGenerationId : null;
    if (!id) return null;
    return { lastGenerationId: id };
  },
  getDisplayId(params) {
    if (!params || typeof params !== "object") return null;
    const id = (params as Record<string, unknown>).lastGenerationId;
    return typeof id === "string" ? id : null;
  },
};

// ----- detectModel -----

/**
 * Best-effort detection: read OPENROUTER_MODEL or fall back to "openrouter/auto".
 * Other adapters read from on-disk CLI configs; OpenRouter has none, so env
 * is the only meaningful source.
 */
export async function detectModel(): Promise<{
  model: string;
  provider: string;
  source: string;
} | null> {
  const fromEnv = process.env.OPENROUTER_MODEL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return { model: fromEnv.trim(), provider: "openrouter", source: "env:OPENROUTER_MODEL" };
  }
  return { model: "openrouter/auto", provider: "openrouter", source: "default" };
}

// ----- listSkills / syncSkills -----

/**
 * Minimal skill listing. We scan the same root our skill loader uses
 * (~/.openrouter-adapter/skills by default) and report each subdirectory
 * containing a SKILL.md as an external skill.
 *
 * v1 doesn't track desired-vs-installed because we don't sync from
 * Paperclip's managed skill store yet — that's a v3 feature.
 */
function defaultSkillsRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(home, ".openrouter-adapter", "skills");
}

export async function listSkills(_ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  const root = process.env.PAPERCLIP_SKILLS_DIR?.trim() || defaultSkillsRoot();
  const snapshot: AdapterSkillSnapshot = {
    adapterType: "openrouter",
    supported: true,
    mode: "ephemeral",
    desiredSkills: [],
    entries: [],
    warnings: [],
  };

  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    snapshot.warnings.push(`Skills root ${root} not present.`);
    return snapshot;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillDir = path.join(root, entry.name);
    const skillMd = path.join(skillDir, "SKILL.md");
    let hasSkillMd = true;
    try {
      await fs.access(skillMd);
    } catch {
      hasSkillMd = false;
    }
    if (!hasSkillMd) continue;
    snapshot.entries.push({
      key: entry.name,
      runtimeName: entry.name,
      desired: true,
      managed: false,
      state: "external",
      origin: "external_unknown",
      sourcePath: skillDir,
      targetPath: skillDir,
    });
  }

  return snapshot;
}

export async function syncSkills(
  ctx: AdapterSkillContext,
  _desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  // v1: skills are managed externally (operator drops them in skillsRoot).
  // We just return the current listing — no copy/sync work.
  return listSkills(ctx);
}

// ----- getConfigSchema -----

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "apiKey",
        label: "OpenRouter API Key",
        type: "text",
        hint: "Get your key at https://openrouter.ai/keys",
        required: true,
      },
      {
        key: "model",
        label: "Model",
        type: "combobox",
        hint: 'Select a model or use "openrouter/auto" for auto-routing. Models are loaded dynamically from OpenRouter.',
        required: true,
        options: [
          { value: "openrouter/auto", label: "Auto (best free route)" },
          { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
          { value: "openai/gpt-4.1", label: "GPT-4.1" },
          { value: "openai/o4-mini", label: "o4-mini" },
          { value: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro" },
          { value: "google/gemini-2.5-flash-preview", label: "Gemini 2.5 Flash" },
          { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
        ],
      },
      {
        key: "systemPrompt",
        label: "System Prompt",
        type: "textarea",
        hint: "Prepended to all messages.",
        required: false,
      },
      {
        key: "temperature",
        label: "Temperature",
        type: "number",
        hint: "Sampling temperature (0-2). Default: 0.7",
        required: false,
      },
      {
        key: "maxTokens",
        label: "Max Tokens",
        type: "number",
        hint: "Max completion tokens. Default: 4096",
        required: false,
      },
      {
        key: "stream",
        label: "Enable Streaming",
        type: "toggle",
        default: true,
      },
      {
        key: "reasoning",
        label: "Enable Reasoning (extended thinking)",
        type: "toggle",
        default: false,
        hint: "Only works with models that support reasoning (DeepSeek R1, QwQ, etc.)",
      },
      {
        key: "route",
        label: "Routing Strategy",
        type: "select",
        options: [
          { value: "fallback", label: "Fallback (auto-retry with other providers)" },
          { value: "no-fallback", label: "No Fallback (single provider only)" },
        ],
        default: "fallback",
      },
    ],
  };
}
