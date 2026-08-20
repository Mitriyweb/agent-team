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
  modelrouter: {
    defaultModel: "model-router-auto",
    baseURL: process.env.MODEL_ROUTER_HOST
      ? `${process.env.MODEL_ROUTER_HOST.replace(/\/+$/, "")}/v1`
      : "http://localhost:8787/v1",
    apiKey: process.env.MODEL_ROUTER_API_KEY ?? "dummy",
  },
  "model-router": {
    defaultModel: "model-router-auto",
    baseURL: process.env.MODEL_ROUTER_HOST
      ? `${process.env.MODEL_ROUTER_HOST.replace(/\/+$/, "")}/v1`
      : "http://localhost:8787/v1",
    apiKey: process.env.MODEL_ROUTER_API_KEY ?? "dummy",
  },
};
