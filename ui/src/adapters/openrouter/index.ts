import type { UIAdapterModule } from "../types";
import { parseOpenRouterStdoutLine } from "./parse-stdout";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "../schema-config-fields";

export const openRouterUIAdapter: UIAdapterModule = {
  type: "openrouter",
  label: "OpenRouter",
  parseStdoutLine: parseOpenRouterStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildSchemaAdapterConfig,
};
