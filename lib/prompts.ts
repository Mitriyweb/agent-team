/**
 * Interactive prompts for agent-team CLI (Vite-style).
 * Uses @clack/prompts for a polished terminal UI.
 *
 * When CLI flags are provided, prompts are skipped (non-interactive mode).
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
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
  localization: "team-lead → tech-writer → localizer → seo → qa",
};

export interface InitAnswers {
  teamName?: string;
  planner: "builtin" | "openspec";
  humanReview: boolean;
  vaultPath?: string;
}

export async function promptInit(
  sourceDir: string,
  defaults: Partial<InitAnswers>,
): Promise<InitAnswers | null> {
  const teams = getAvailableTeams(sourceDir);

  const result = await p.group(
    {
      teamName: () => {
        if (defaults.teamName) return Promise.resolve(defaults.teamName);
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
        });
      },
      planner: () => {
        if (defaults.planner) return Promise.resolve(defaults.planner);
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
      vaultPath: () => {
        if (defaults.vaultPath) return Promise.resolve(defaults.vaultPath);
        return p.text({
          message: "Obsidian vault path for RAG (optional)",
          placeholder: "/path/to/your/vault",
          validate: (v) => {
            if (v && !fs.existsSync(v)) return "Path does not exist";
            return undefined;
          },
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
    teamName:
      result.teamName === "__skip__" ? undefined : (result.teamName as string),
    planner: result.planner as "builtin" | "openspec",
    humanReview: result.humanReview as boolean,
    vaultPath: (result as any).vaultPath as string | undefined,
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
      vaultDir: () => {
        if (defaults.vaultDir) return Promise.resolve(defaults.vaultDir);
        return p.text({
          message: "Obsidian vault output directory",
          placeholder: "./vault",
          defaultValue: "./vault",
        });
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
