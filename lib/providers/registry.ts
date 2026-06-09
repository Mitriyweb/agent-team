import type { ModelProvider } from "./base.ts";
import { ClaudeProvider } from "./claude.ts";
import { GeminiProvider } from "./gemini.ts";
import { OllamaProvider } from "./ollama.ts";
import { OpenAIProvider } from "./openai.ts";

export function resolveProvider(
  provider: string,
  modelOverride?: string,
): ModelProvider {
  switch (provider.toLowerCase()) {
    case "claude":
      return new ClaudeProvider(modelOverride);
    case "gemini":
      return new GeminiProvider(modelOverride);
    case "ollama":
      return new OllamaProvider(modelOverride);
    case "openai":
      return new OpenAIProvider(modelOverride);
    default:
      // Fallback to claude
      return new ClaudeProvider(modelOverride);
  }
}
