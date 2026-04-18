/**
 * Interactive prompts for agent-team CLI (Vite-style).
 * Uses @clack/prompts for a polished terminal UI.
 *
 * When CLI flags are provided, prompts are skipped (non-interactive mode).
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { ExternalReviewAgent, type TelegramConfig } from "./common.ts";
import { EMBEDDED_TEAM_NAMES } from "./embedded-agents.ts";

function listSourceTeams(sourceDir: string): string[] {
  const agentsDir = path.join(sourceDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function getAvailableTeams(sourceDir: string): string[] {
  return [...new Set([...listSourceTeams(sourceDir), ...EMBEDDED_TEAM_NAMES])];
}

const TEAM_DESCRIPTIONS: Record<string, string> = {
  "software development": "team-lead → architect → developer → reviewer → qa",
  frontend: "team-lead → ui-architect → frontend-dev → design-reviewer → qa",
  fullstack: "team-lead → architect → fe-dev + be-dev → reviewer → qa",
  localization: "team-lead → tech-writer → localizer → seo → qa",
};

export async function promptVault(
  message: string,
  defaultValue?: string,
  allowSkip = true,
): Promise<string | symbol | undefined> {
  if (allowSkip) {
    const enable = await p.confirm({
      message: defaultValue
        ? `Keep vault integration? (${defaultValue})`
        : "Enable Obsidian vault for RAG?",
      initialValue: !!defaultValue,
    });

    if (p.isCancel(enable)) return enable;
    if (!enable) return undefined;
  }

  return p.text({
    message,
    placeholder: defaultValue || "./vault",
    initialValue: defaultValue,
    validate: (v) => {
      if (!v?.trim()) return "Path is required";
      if (v && !fs.existsSync(v)) return "Path does not exist";
      return undefined;
    },
  });
}

const EXTERNAL_REVIEW_AGENTS: {
  value: ExternalReviewAgent | "__none__";
  label: string;
  hint: string;
}[] = [
  { value: "__none__", label: "None", hint: "no external review" },
  {
    value: ExternalReviewAgent.Codex,
    label: "Codex",
    hint: "OpenAI Codex CLI (codex)",
  },
  {
    value: ExternalReviewAgent.Devin,
    label: "Devin",
    hint: "Devin CLI (devin)",
  },
  {
    value: ExternalReviewAgent.Aider,
    label: "Aider",
    hint: "Aider CLI (aider)",
  },
  {
    value: ExternalReviewAgent.Claude,
    label: "Claude Code",
    hint: "Claude Code CLI (claude)",
  },
  {
    value: ExternalReviewAgent.Gemini,
    label: "Gemini CLI",
    hint: "Google Gemini CLI (gemini)",
  },
];

export async function promptExternalReview(
  current?: ExternalReviewAgent,
): Promise<ExternalReviewAgent | undefined> {
  const selected = await p.select({
    message: "External review agent (optional)",
    options: EXTERNAL_REVIEW_AGENTS,
    initialValue: current ?? ("__none__" as const),
  });

  if (p.isCancel(selected)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return selected === "__none__"
    ? undefined
    : (selected as ExternalReviewAgent);
}

export async function promptTelegram(
  current?: TelegramConfig,
): Promise<TelegramConfig | undefined> {
  const enable = await p.confirm({
    message: "Enable Telegram notifications?",
    initialValue: !!current,
  });

  if (p.isCancel(enable)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (!enable) {
    return undefined;
  }

  const result = await p.group(
    {
      botToken: () =>
        p.text({
          message: "Telegram bot token (from @BotFather)",
          placeholder: "7xxxxxxx:AAF...",
          initialValue: current?.botToken,
          validate: (v) => {
            if (!v?.trim()) {
              return "Bot token is required";
            }
            if (!v.includes(":")) {
              return "Invalid token format (expected id:hash)";
            }
            return undefined;
          },
        }),
      chatId: () =>
        p.text({
          message: "Telegram chat ID (from @userinfobot)",
          placeholder: "123456789",
          initialValue: current?.chatId,
          validate: (v) => {
            if (!v?.trim()) {
              return "Chat ID is required";
            }
            return undefined;
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  return {
    botToken: (result.botToken as string).trim(),
    chatId: (result.chatId as string).trim(),
  };
}

export interface InitAnswers {
  teamName?: string;
  planner: "builtin" | "openspec";
  humanReview: boolean;
  vaultPath?: string;
  externalReview?: ExternalReviewAgent;
  telegram?: TelegramConfig;
}

export async function promptInit(
  sourceDir: string,
  defaults: Partial<InitAnswers>,
): Promise<InitAnswers | null> {
  const teams = getAvailableTeams(sourceDir);

  const result = await p.group(
    {
      teamName: () => {
        return p.select({
          message: "Select a team",
          options: [
            ...teams.map((t) => ({
              value: t,
              label: t,
              hint: TEAM_DESCRIPTIONS[t] || "",
            })),
            { value: "__skip__", label: "skip", hint: "init without a team" },
          ],
          initialValue: defaults.teamName,
        });
      },
      planner: () => {
        return p.select({
          message: "Planner",
          options: [
            {
              value: "builtin" as const,
              label: "Built-in",
              hint: "ROADMAP.md → tasks/plan.md",
            },
            {
              value: "openspec" as const,
              label: "OpenSpec",
              hint: "structured proposals (requires @fission-ai/openspec)",
            },
          ],
          initialValue: defaults.planner,
        });
      },
      humanReview: () => {
        return p.confirm({
          message: "Enable human review checkpoints?",
          initialValue: defaults.humanReview ?? true,
        });
      },
      vaultPath: async () => {
        const result = await promptVault(
          "Select Obsidian vault for RAG (optional):",
          defaults.vaultPath,
          true,
        );
        if (p.isCancel(result)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        return result as string | undefined;
      },
      externalReview: async () => {
        return promptExternalReview(defaults.externalReview);
      },
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  const telegram = await promptTelegram(defaults.telegram);

  return {
    teamName:
      result.teamName === "__skip__" ? undefined : (result.teamName as string),
    planner: result.planner as "builtin" | "openspec",
    humanReview: result.humanReview as boolean,
    vaultPath: (result as { vaultPath?: string }).vaultPath,
    externalReview: result.externalReview as ExternalReviewAgent | undefined,
    telegram,
  };
}

export interface NewTeamAnswers {
  name: string;
  description: string;
  roles: string;
  humanReview: boolean;
}

export async function promptNewTeam(
  defaults: Partial<NewTeamAnswers>,
): Promise<NewTeamAnswers | null> {
  const result = await p.group(
    {
      name: () => {
        if (defaults.name) return Promise.resolve(defaults.name);
        return p.text({
          message: "Team name",
          placeholder: "security-audit",
          validate: (v) => (!v?.trim() ? "Team name is required" : undefined),
        });
      },
      description: () => {
        if (defaults.description) return Promise.resolve(defaults.description);
        return p.text({
          message: "Team description",
          placeholder: "Security and vulnerability assessment team",
          validate: (v) => (!v?.trim() ? "Description is required" : undefined),
        });
      },
      roles: () => {
        if (defaults.roles) return Promise.resolve(defaults.roles);
        return p.text({
          message: "Agent roles (comma-separated)",
          placeholder: "architect,developer,reviewer,qa",
          validate: (v) =>
            !v?.trim() ? "At least one role is required" : undefined,
        });
      },
      humanReview: () => {
        if (defaults.humanReview !== undefined)
          return Promise.resolve(defaults.humanReview);
        return p.confirm({
          message: "Enable human review checkpoints?",
          initialValue: true,
        });
      },
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  return {
    name: result.name as string,
    description: result.description as string,
    roles: result.roles as string,
    humanReview: result.humanReview as boolean,
  };
}

export interface SyncVaultAnswers {
  agentsDir: string;
  vaultDir: string;
}

export async function promptSyncVault(
  defaults: Partial<SyncVaultAnswers>,
): Promise<SyncVaultAnswers | null> {
  const result = await p.group(
    {
      agentsDir: () => {
        if (defaults.agentsDir) return Promise.resolve(defaults.agentsDir);
        return p.text({
          message: "Source directory (agents, specs, or mixed)",
          placeholder: "./agents",
          defaultValue: "./agents",
          validate: (v) => {
            if (!v?.trim()) return "Path is required";
            if (!fs.existsSync(v.trim())) return `Directory not found: ${v}`;
            return undefined;
          },
        });
      },
      vaultDir: async () => {
        if (defaults.vaultDir) return Promise.resolve(defaults.vaultDir);
        const result = await promptVault(
          "Obsidian vault output directory:",
          "./vault",
          false,
        );
        if (p.isCancel(result)) {
          p.cancel("Sync cancelled.");
          process.exit(0);
        }
        return (result as string) || "./vault";
      },
    },
    {
      onCancel: () => {
        p.cancel("Sync cancelled.");
        process.exit(0);
      },
    },
  );

  return {
    agentsDir: result.agentsDir as string,
    vaultDir: result.vaultDir as string,
  };
}

export interface ImportAnswers {
  source: string;
}

export async function promptImport(
  defaultSource?: string,
): Promise<ImportAnswers | null> {
  if (defaultSource) return { source: defaultSource };

  const knownSources = [
    { value: ".windsurf", label: ".windsurf", desc: "Windsurf rules" },
    { value: ".cursor", label: ".cursor", desc: "Cursor rules" },
    { value: ".github", label: ".github", desc: "GitHub Copilot instructions" },
    { value: ".claude", label: ".claude", desc: "Claude Code project" },
  ];

  {
    const result = await p.group(
      {
        source: () =>
          p.select({
            message: "Import rules from",
            options: [
              ...knownSources.map((s) => ({
                value: s.value,
                label: s.label,
                hint: fs.existsSync(s.value) ? `${s.desc} — found` : s.desc,
              })),
              {
                value: "__custom__",
                label: "custom path",
                hint: "enter a path manually",
              },
            ],
          }),
        customPath: ({ results }) => {
          if (results.source !== "__custom__")
            return Promise.resolve(undefined);
          return p.text({
            message: "Path to import from",
            placeholder: "/path/to/project",
            validate: (v) => {
              if (!v?.trim()) return "Path is required";
              if (!fs.existsSync(v.trim())) return "Path does not exist";
              return undefined;
            },
          });
        },
      },
      {
        onCancel: () => {
          p.cancel("Import cancelled.");
          process.exit(0);
        },
      },
    );

    return {
      source:
        result.source === "__custom__"
          ? (result.customPath as string)
          : (result.source as string),
    };
  }
}
