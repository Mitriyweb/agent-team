import { query } from "@anthropic-ai/claude-agent-sdk";
import { PROVIDERS_CONFIG } from "../providers.config.ts";
import type { ModelProvider, QueryOptions } from "./base.ts";

export class ClaudeProvider implements ModelProvider {
  name = "claude";
  private model: string;

  constructor(modelOverride?: string) {
    this.model = modelOverride ?? PROVIDERS_CONFIG.claude.defaultModel;
  }

  async query(prompt: string, options: QueryOptions): Promise<string> {
    let output = "";
    const sdkOptions = {
      systemPrompt: options.systemPrompt,
      model: this.model,
      // We limit turns for a simple completion-style query via the SDK
      maxTurns: 1,
    };

    for await (const message of query({ prompt, options: sdkOptions })) {
      if (message.type === "result" && message.subtype === "success") {
        output = message.result ?? "";
      }
    }
    return output;
  }
}
