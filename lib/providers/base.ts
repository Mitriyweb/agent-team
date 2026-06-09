export interface QueryOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelProvider {
  name: string;
  query(prompt: string, options: QueryOptions): Promise<string>;
}
