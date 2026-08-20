import type { ModelProvider } from "./base.ts";
import { ClaudeProvider } from "./claude.ts";
import { GeminiProvider } from "./gemini.ts";
import { ModelRouterProvider } from "./modelrouter.ts";
import { OllamaProvider } from "./ollama.ts";
import { OpenAIProvider } from "./openai.ts";

export function resolveProvider(
  provider: string,
  modelOverride?: string,
): ModelProvider {
  const p = provider.toLowerCase().replace(/[-_]/g, "");
  switch (p) {
    case "claude":
      return new ClaudeProvider(modelOverride);
    case "gemini":
      return new GeminiProvider(modelOverride);
    case "ollama":
      return new OllamaProvider(modelOverride);
    case "openai":
      return new OpenAIProvider(modelOverride);
    case "modelrouter":
      return new ModelRouterProvider(modelOverride);
    default:
      // Fallback to claude
      return new ClaudeProvider(modelOverride);
  }
}
