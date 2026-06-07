import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ModelProvider, QueryOptions } from "./base.ts";
import { PROVIDERS_CONFIG } from "../providers.config.ts";

export class GeminiProvider implements ModelProvider {
  name = "gemini";
  private model: string;
  private genAI: GoogleGenerativeAI;

  constructor(modelOverride?: string) {
    this.model = modelOverride ?? PROVIDERS_CONFIG.gemini.defaultModel;
    this.genAI = new GoogleGenerativeAI(PROVIDERS_CONFIG.gemini.apiKey ?? "");
  }

  async query(prompt: string, options: QueryOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: options.systemPrompt,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    return result.response.text();
  }
}
