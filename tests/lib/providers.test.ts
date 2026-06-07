import { expect, test, describe, mock } from "bun:test";
import { ProviderRegistry } from "../../lib/providers/registry.ts";
import { PROVIDERS_CONFIG } from "../../lib/providers.config.ts";

describe("ProviderRegistry", () => {
  test("resolves claude provider by default", () => {
    const provider = ProviderRegistry.resolve("unknown");
    expect(provider.name).toBe("claude");
  });

  test("resolves gemini provider", () => {
    const provider = ProviderRegistry.resolve("gemini");
    expect(provider.name).toBe("gemini");
  });

  test("resolves ollama provider", () => {
    const provider = ProviderRegistry.resolve("ollama");
    expect(provider.name).toBe("ollama");
  });

  test("resolves openai provider", () => {
    const provider = ProviderRegistry.resolve("openai");
    expect(provider.name).toBe("openai");
  });
});

describe("OllamaProvider", () => {
  test("query calls fetch with correct parameters", async () => {
    const provider = ProviderRegistry.resolve("ollama", "test-model");

    // Mock global fetch
    const originalFetch = global.fetch;
    global.fetch = mock(async (url, init) => {
      expect(url).toBe(`${PROVIDERS_CONFIG.ollama.host}/api/generate`);
      const body = JSON.parse(init.body);
      expect(body.model).toBe("test-model");
      expect(body.prompt).toBe("hello");
      expect(body.system).toBe("system");
      return new Response(JSON.stringify({ response: "hi" }));
    });

    const result = await provider.query("hello", { systemPrompt: "system" });
    expect(result).toBe("hi");

    global.fetch = originalFetch;
  });
});
