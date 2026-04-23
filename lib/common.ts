import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function expandHome(input: string): string {
  if (input.startsWith("~")) {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

export enum Platform {
  Darwin = "darwin",
  Linux = "linux",
  Win32 = "win32",
}

/**
 * Detect how to invoke OpenSpec. Prefers the `openspec` binary on PATH
 * (covers Homebrew, global npm with bin symlink, etc.), falls back to
 * `npx --no-install @fission-ai/openspec`. Returns undefined if neither
 * is available.
 */
export function detectOpenSpecInvocation(): string[] | undefined {
  try {
    const direct = Bun.spawnSync(["openspec", "--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    if (direct.success) return ["openspec"];
  } catch {
    // fall through
  }
  try {
    const viaNpx = Bun.spawnSync(
      ["npx", "--no-install", "@fission-ai/openspec", "--version"],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    if (viaNpx.success) {
      return ["npx", "--no-install", "@fission-ai/openspec"];
    }
  } catch {
    // fall through
  }
  return undefined;
}

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

/**
 * Play a pre-recorded sound from ~/.agent-team/assets/<asset>, falling back
 * to platform TTS (`say` on macOS, `spd-say` on Linux) and the terminal bell
 * as last resort. Used for audible notifications: review needed, loop done,
 * loop failed.
 */
function playNotification(assetName: string, ttsMessage: string): void {
  const soundFile = path.join(
    process.env.HOME || "",
    ".agent-team/assets",
    assetName,
  );
  let played = false;

  if (fs.existsSync(soundFile)) {
    try {
      if (process.platform === Platform.Darwin) {
        const proc = Bun.spawnSync(["afplay", soundFile]);
        if (proc.success) played = true;
      } else if (process.platform === Platform.Linux) {
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
    try {
      if (process.platform === Platform.Darwin) {
        Bun.spawnSync(["say", ttsMessage]);
      } else if (process.platform === Platform.Linux) {
        Bun.spawnSync(["spd-say", ttsMessage]);
      } else {
        process.stdout.write("\x07"); // bell
      }
    } catch (_e) {
      process.stdout.write("\x07");
    }
  }
}

export function notifyReview(): void {
  playNotification("review.m4a", "Review required");
}

export function notifyDone(): void {
  playNotification("done.m4a", "All tasks completed");
}

export function notifyFailed(reason?: string): void {
  // Keep spoken reason short and natural — long exception messages with
  // paths and stack frames sound terrible through TTS.
  let spoken = "Loop stopped due to error";
  if (reason) {
    const firstSentence = reason.split(/[\n.]/)[0]?.replace(/[`"]/g, "").trim();
    const short =
      firstSentence && firstSentence.length <= 80
        ? firstSentence
        : `${firstSentence?.slice(0, 80)}…`;
    if (short) spoken = `Loop stopped due to error. ${short}`;
  }
  playNotification("failed.m4a", spoken);
}

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Per-million-token prices in USD. Matches Anthropic pricing for Claude 4.x.
 * Cache reads are ~90% cheaper than regular input — the main savings lever for
 * stable system prompts.
 *
 * Source: https://www.anthropic.com/pricing (verified 2026-04-23).
 * Update these if Anthropic publishes new rates.
 */
const PRICE_OPUS: ModelPrice = {
  input: 15,
  output: 75,
  cacheWrite: 18.75,
  cacheRead: 1.5,
};
const PRICE_SONNET: ModelPrice = {
  input: 3,
  output: 15,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};
const PRICE_HAIKU: ModelPrice = {
  input: 1,
  output: 5,
  cacheWrite: 1.25,
  cacheRead: 0.1,
};

function priceFor(model: string): ModelPrice {
  if (model.includes("opus")) return PRICE_OPUS;
  if (model.includes("haiku")) return PRICE_HAIKU;
  return PRICE_SONNET;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
): string {
  const p = priceFor(model);
  const cost =
    (inputTokens * p.input +
      outputTokens * p.output +
      cacheCreationTokens * p.cacheWrite +
      cacheReadTokens * p.cacheRead) /
    1_000_000;
  return cost.toFixed(6);
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

/** Supported external CLI agents for external review */
export enum ExternalReviewAgent {
  Codex = "codex",
  Devin = "devin",
  Aider = "aider",
  Claude = "claude",
  Gemini = "gemini",
}

export interface ExternalReviewConfig {
  /** Which CLI agent to use */
  agent: ExternalReviewAgent;
  /** Custom command override (default: auto-detected from agent) */
  command?: string;
}

export interface TelegramConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Chat ID for notifications */
  chatId: string;
}

export enum Planner {
  Builtin = "builtin",
  Openspec = "openspec",
}

export enum Command {
  Init = "init",
  Run = "run",
  Plan = "plan",
  NewTeam = "new-team",
  Import = "import",
  Update = "update",
  Reconfigure = "reconfigure",
  Validate = "validate",
  AuditHook = "audit-hook",
  Audit = "audit",
  SyncVault = "sync-vault",
}

export enum AuditStatus {
  Success = "success",
  Error = "error",
}

export enum ImportSource {
  Windsurf = ".windsurf",
  Cursor = ".cursor",
  Github = ".github",
  Claude = ".claude",
}

export enum Priority {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum TaskStatus {
  Success = "SUCCESS",
  HumanReviewNeeded = "HUMAN_REVIEW_NEEDED",
  Missing = "MISSING",
  Failed = "FAILED",
}

export enum VaultDocType {
  Agent = "agent",
  Spec = "spec",
}

export enum RuleTrigger {
  Always = "always",
  Glob = "glob",
  Manual = "manual",
}

export interface ProjectConfig {
  planner: Planner;
  team?: string;
  vaultPath?: string;
  /** Extra regex patterns to block in Bash (added to built-in defaults) */
  blockedBashPatterns?: string[];
  /** External CLI agent for spec/implementation review */
  externalReview?: ExternalReviewConfig;
  /** Telegram notifications for task lifecycle */
  telegram?: TelegramConfig;
  /** If false, auto-approve HUMAN_REVIEW_NEEDED tasks without prompting */
  humanReview?: boolean;
  [key: string]: unknown;
}

export function loadConfig(): ProjectConfig {
  const defaults: ProjectConfig = { planner: Planner.Builtin };
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
  "claude-haiku-4-6": "haiku",
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
