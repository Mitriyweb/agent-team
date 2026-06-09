export const PROVIDERS_CONFIG = {
  claude: {
    defaultModel: "claude-sonnet-4-6",
  },
  gemini: {
    defaultModel: "gemini-1.5-pro",
    apiKey: process.env.GEMINI_API_KEY,
  },
  ollama: {
    defaultModel: "qwen2.5:latest",
    host: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  },
  openai: {
    defaultModel: "gpt-4o",
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
  },
};
