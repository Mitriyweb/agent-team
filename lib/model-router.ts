import type { AgentFrontmatter, Stage } from "./sdk/agent-runner.ts";

/**
 * Resolves the model name and provider for an agent based on the current execution stage.
 *
 * Logic priority:
 * 1. Runtime stage (if provided)
 * 2. Frontmatter 'stage' field (if runtime stage missing)
 * 3. Default to 'implementation' if neither of the above specified
 *
 * Once a stage is resolved:
 * - If frontmatter 'model' is a string, return it.
 * - If frontmatter 'model' is an object mapping stages to models, return the model for the resolved stage.
 * - Fall back to 'implementation' model if the resolved stage is not in the object.
 */
export function getModel(
  frontmatter: AgentFrontmatter,
  runtimeStage?: Stage,
): string {
  const resolvedStage: Stage =
    runtimeStage || frontmatter.stage || "implementation";

  if (typeof frontmatter.model === "object" && frontmatter.model !== null) {
    const modelMap = frontmatter.model as Record<Stage, string>;
    return modelMap[resolvedStage] || modelMap.implementation || "";
  }

  return (frontmatter.model as string) || "";
}

/**
 * Resolves the provider for an agent.
 * Logic priority:
 * 1. Frontmatter 'provider' field
 * 2. Fallback to 'claude'
 */
export function getProvider(frontmatter: AgentFrontmatter): string {
  return frontmatter.provider || "claude";
}
