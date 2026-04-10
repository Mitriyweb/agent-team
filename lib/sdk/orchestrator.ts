import {
  type AgentRunnerOptions,
  type AgentRunResult,
  runAgent,
} from "./agent-runner.ts";

export interface AgentTask {
  id: string;
  team: string;
  role: string;
  prompt: string;
  /** IDs of tasks that must complete before this one starts */
  dependsOn?: string[];
}

export interface OrchestratorResult {
  id: string;
  role: string;
  result: AgentRunResult;
}

/**
 * Run tasks in parallel (no deps) or sequentially (with deps).
 * Outputs from completed dependencies are injected into dependent prompts.
 */
export async function runTeam(
  tasks: AgentTask[],
  sharedOpts?: Partial<AgentRunnerOptions>,
): Promise<OrchestratorResult[]> {
  const results: Map<string, OrchestratorResult> = new Map();
  const pending = [...tasks];
  const running: Map<string, Promise<OrchestratorResult>> = new Map();

  while (pending.length > 0 || running.size > 0) {
    const ready = pending.filter((task) => {
      if (!task.dependsOn?.length) return true;
      return task.dependsOn.every((dep) => results.has(dep));
    });

    for (const task of ready) {
      pending.splice(pending.indexOf(task), 1);

      const contextualPrompt = buildPromptWithContext(task, results);

      const promise = runAgent({
        team: task.team,
        role: task.role,
        prompt: contextualPrompt,
        ...sharedOpts,
      }).then((result) => {
        const r: OrchestratorResult = {
          id: task.id,
          role: task.role,
          result,
        };
        results.set(task.id, r);
        running.delete(task.id);
        console.log(
          `\n\x1b[32m\u2713\x1b[0m [${task.role}] done | turns=${result.turns} cost=$${result.cost?.toFixed(4) ?? "?"}`,
        );
        return r;
      });

      running.set(task.id, promise);
    }

    if (running.size === 0 && pending.length > 0) {
      throw new Error(
        "Deadlock: remaining tasks have unresolvable dependencies",
      );
    }

    if (running.size > 0) {
      await Promise.race(running.values());
    }
  }

  return Array.from(results.values());
}

function buildPromptWithContext(
  task: AgentTask,
  results: Map<string, OrchestratorResult>,
): string {
  if (!task.dependsOn?.length) return task.prompt;

  const context = task.dependsOn
    .map((dep) => {
      const r = results.get(dep);
      if (!r) return "";
      return `## Output from ${r.role}:\n${r.result.output}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `${context}\n\n---\n\n${task.prompt}`;
}
