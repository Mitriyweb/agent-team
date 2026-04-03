import fs from "node:fs";
import path from "node:path";

export const RED = "\x1b[31m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const BLUE = "\x1b[34m";
export const CYAN = "\x1b[36m";
export const NC = "\x1b[0m";

export function log(...args: unknown[]) {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.log(`${CYAN}[${time}]${NC}`, ...args);
}

export function ok(...args: unknown[]) {
  console.log(`${GREEN}✓${NC}`, ...args);
}

export function warn(...args: unknown[]) {
  console.warn(`${YELLOW}!${NC}`, ...args);
}

export function err(...args: unknown[]): never {
  console.error(`${RED}✗${NC}`, ...args);
  process.exit(1);
}

export function loadEnv(envFile = ".env") {
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
      if (match) {
        let value = (match[2] || "").trim();
        // Remove trailing comments
        if (
          value.includes("#") &&
          !value.startsWith('"') &&
          !value.startsWith("'")
        ) {
          const parts = value.split("#");
          if (parts[0]) {
            value = parts[0].trim();
          }
        }
        if (value.startsWith('"') && value.endsWith('"'))
          value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'"))
          value = value.slice(1, -1);
        const key = match[1];
        if (key) {
          process.env[key] = value;
        }
      }
    }
  }
}

export function notifyReview() {
  const soundFile = path.join(
    process.env.HOME || "",
    ".agent-team/assets/review.m4a",
  );
  let played = false;

  if (fs.existsSync(soundFile)) {
    try {
      if (process.platform === "darwin") {
        const proc = Bun.spawnSync(["afplay", soundFile]);
        if (proc.success) played = true;
      } else if (process.platform === "linux") {
        const paplay = Bun.spawnSync(["paplay", "--version"]);
        if (paplay.success) {
          const proc = Bun.spawnSync(["paplay", soundFile]);
          if (proc.success) played = true;
        } else {
          const aplay = Bun.spawnSync(["aplay", "--version"]);
          if (aplay.success) {
            const proc = Bun.spawnSync(["aplay", soundFile]);
            if (proc.success) played = true;
          }
        }
      }
    } catch (_e) {
      // Ignore playback errors
    }
  }

  if (!played) {
    const msg = "Review required";
    try {
      if (process.platform === "darwin") {
        Bun.spawnSync(["say", msg]);
      } else if (process.platform === "linux") {
        Bun.spawnSync(["spd-say", msg]);
      } else {
        process.stdout.write("\x07"); // bell
      }
    } catch (_e) {
      process.stdout.write("\x07");
    }
  }
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): string {
  let inputPrice = 0.000003; // Sonnet default
  let outputPrice = 0.000015;

  if (model.includes("opus")) {
    inputPrice = 0.000015;
    outputPrice = 0.000075;
  }

  return (inputTokens * inputPrice + outputTokens * outputPrice).toFixed(6);
}

export function configureProvider() {
  loadEnv();

  const provider = process.env.PROVIDER || "oauth";

  switch (provider) {
    case "oauth":
      if (process.env.ANTHROPIC_BASE_URL) {
        log(`Provider: ${GREEN}OAuth${NC} → ${process.env.ANTHROPIC_BASE_URL}`);
      } else {
        log(`Provider: ${GREEN}OAuth (direct)${NC}`);
      }
      break;

    case "anthropic":
      if (!process.env.ANTHROPIC_API_KEY)
        err("ANTHROPIC_API_KEY not set in .env");
      delete process.env.ANTHROPIC_BASE_URL;
      log(`Provider: ${GREEN}Anthropic (direct)${NC}`);
      break;

    case "azure-apim":
      if (!process.env.AZURE_APIM_ENDPOINT)
        err("AZURE_APIM_ENDPOINT not set in .env");
      if (!process.env.AZURE_APIM_KEY) err("AZURE_APIM_KEY not set in .env");
      process.env.ANTHROPIC_BASE_URL = process.env.AZURE_APIM_ENDPOINT;
      process.env.ANTHROPIC_AUTH_TOKEN = process.env.AZURE_APIM_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      log(
        `Provider: ${GREEN}Azure APIM (key)${NC} → ${process.env.AZURE_APIM_ENDPOINT}`,
      );
      break;

    case "azure-apim-oauth":
      if (!process.env.AZURE_APIM_ENDPOINT)
        err("AZURE_APIM_ENDPOINT not set in .env");
      process.env.ANTHROPIC_BASE_URL = process.env.AZURE_APIM_ENDPOINT;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
      log(
        `Provider: ${GREEN}Azure APIM (OAuth)${NC} → ${process.env.AZURE_APIM_ENDPOINT}`,
      );
      break;

    case "litellm": {
      const host = process.env.LITELLM_HOST || "http://localhost:8080";
      process.env.ANTHROPIC_BASE_URL = host;
      process.env.ANTHROPIC_API_KEY =
        process.env.LITELLM_API_KEY || "local-key";
      log(`Provider: ${GREEN}LiteLLM${NC} → ${host}`);
      break;
    }

    default:
      err(
        `Unknown PROVIDER '${provider}'. Use: oauth, anthropic, azure-apim, azure-apim-oauth, litellm`,
      );
  }
}

const CONFIG_FILE = "agent-team.json";

export interface ProjectConfig {
  planner: "builtin" | "openspec";
  [key: string]: unknown;
}

export function loadConfig(): ProjectConfig {
  const defaults: ProjectConfig = { planner: "builtin" };
  if (!fs.existsSync(CONFIG_FILE)) return defaults;
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return { ...defaults, ...data };
  } catch {
    return defaults;
  }
}

export function saveConfig(config: ProjectConfig) {
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Normalize frontmatter model names (e.g. `claude-opus`) to CLI-compatible
 * model aliases accepted by `claude --model`.
 */
const MODEL_ALIASES: Record<string, string> = {
  "claude-opus": "opus",
  "claude-opus-4-6": "opus",
  "claude-sonnet": "sonnet",
  "claude-sonnet-4-6": "sonnet",
  "claude-haiku": "haiku",
  "claude-haiku-4-5": "haiku",
};

export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model] || model;
}

export function printHeader() {
  console.log(BLUE);
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║    Claude Code Agent Team            ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log(NC);
}
