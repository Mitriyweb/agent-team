import OpenAI from "openai";
import { PROVIDERS_CONFIG } from "../providers.config.ts";
import type { ModelProvider, QueryOptions } from "./base.ts";

export class OpenAIProvider implements ModelProvider {
  name = "openai";
  private model: string;
  private client: OpenAI;

  constructor(
    modelOverride?: string,
    options?: { baseURL?: string; apiKey?: string },
  ) {
    this.model = modelOverride ?? PROVIDERS_CONFIG.openai.defaultModel;
    this.client = new OpenAI({
      apiKey:
        options?.apiKey ||
        process.env.OPENAI_API_KEY ||
        PROVIDERS_CONFIG.openai.apiKey ||
        "mock-key",
      baseURL:
        options?.baseURL ||
        process.env.OPENAI_BASE_URL ||
        PROVIDERS_CONFIG.openai.baseURL,
    });
  }

  async query(prompt: string, options: QueryOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        ...(options.systemPrompt
          ? [{ role: "system" as const, content: options.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });

    return response.choices[0]?.message.content ?? "";
  }
}
