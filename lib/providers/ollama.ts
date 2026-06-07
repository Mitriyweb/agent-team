import type { ModelProvider, QueryOptions } from "./base.ts";
import { PROVIDERS_CONFIG } from "../providers.config.ts";

export class OllamaProvider implements ModelProvider {
  name = "ollama";
  private model: string;
  private host: string;

  constructor(modelOverride?: string) {
    this.model = modelOverride ?? PROVIDERS_CONFIG.ollama.defaultModel;
    this.host = PROVIDERS_CONFIG.ollama.host;
  }

  async query(prompt: string, options: QueryOptions): Promise<string> {
    const response = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        system: options.systemPrompt,
        stream: false,
        options: {
          num_predict: options.maxTokens,
          temperature: options.temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }
}
