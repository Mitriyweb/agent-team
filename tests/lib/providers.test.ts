import { describe, expect, mock, test } from "bun:test";
import { resolveProvider } from "../../lib/providers/registry.ts";
import { PROVIDERS_CONFIG } from "../../lib/providers.config.ts";

describe("resolveProvider", () => {
  test("resolves claude provider by default", () => {
    const provider = resolveProvider("unknown");
    expect(provider.name).toBe("claude");
  });

  test("resolves gemini provider", () => {
    const provider = resolveProvider("gemini");
    expect(provider.name).toBe("gemini");
  });

  test("resolves ollama provider", () => {
    const provider = resolveProvider("ollama");
    expect(provider.name).toBe("ollama");
  });

  test("resolves openai provider", () => {
    const provider = resolveProvider("openai");
    expect(provider.name).toBe("openai");
  });
});

describe("OllamaProvider", () => {
  test("query calls fetch with correct parameters", async () => {
    const provider = resolveProvider("ollama", "test-model");

    // Mock global fetch
    const originalFetch = global.fetch;
    // biome-ignore lint/suspicious/noExplicitAny: mocking global fetch
    (global as any).fetch = mock(async (url: string, init: any) => {
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
