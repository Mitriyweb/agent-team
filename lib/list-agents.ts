import fs from "node:fs";
import path from "node:path";
import { BLUE, GREEN, log, NC } from "./common.ts";

/**
 * Lists all registered agents and their roles by parsing frontmatter.
 * Scans both agents/ and .claude/agents/.
 */
async function main() {
  const agentDirs = ["agents", path.join(".claude", "agents")];
  const foundAgents = new Map<
    string,
    { role: string; team: string; file: string }
  >();

  for (const dir of agentDirs) {
    if (!fs.existsSync(dir)) continue;
    scanDir(dir, foundAgents);
  }

  if (foundAgents.size === 0) {
    log("No agents found.");
    return;
  }

  console.log(`\n${BLUE}Registered Agents:${NC}\n`);
  console.log(`${"AGENT".padEnd(25)} | ${"ROLE".padEnd(15)} | ${"TEAM"}`);
  console.log("-".repeat(60));

  for (const [name, info] of foundAgents) {
    console.log(
      `${GREEN}${name.padEnd(25)}${NC} | ${info.role.padEnd(15)} | ${info.team}`,
    );
  }
  console.log("");
}

function scanDir(
  dir: string,
  foundAgents: Map<string, { role: string; team: string; file: string }>,
) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, foundAgents);
    } else if (entry.name.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        if (!fm) continue;
        const name =
          fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ||
          path.basename(entry.name, ".md");
        const role = fm.match(/^role:\s*(.+)$/m)?.[1]?.trim() || "unknown";
        const team =
          fm.match(/^team:\s*(.+)$/m)?.[1]?.trim() || deriveTeam(fullPath);

        if (
          name &&
          (role !== "unknown" ||
            name.includes("team-lead") ||
            name.includes("architect") ||
            name.includes("developer") ||
            name.includes("reviewer") ||
            name.includes("qa") ||
            name.includes("librarian"))
        ) {
          // Even if role is missing in FM, some agents like librarian or sw-team-lead have it in name/content
          let finalRole = role;
          if (finalRole === "unknown") {
            if (name.includes("team-lead")) finalRole = "team-lead";
            else if (name.includes("architect")) finalRole = "architect";
            else if (name.includes("developer") || name.includes("dev"))
              finalRole = "developer";
            else if (name.includes("reviewer")) finalRole = "reviewer";
            else if (name.includes("qa") || name.includes("aqa"))
              finalRole = "qa";
            else if (name.includes("librarian")) finalRole = "librarian";
            else if (name.includes("localizer")) finalRole = "localizer";
            else if (name.includes("tech-writer")) finalRole = "tech-writer";
            else if (name.includes("seo-specialist"))
              finalRole = "seo-specialist";
          }
          foundAgents.set(name, { role: finalRole, team, file: fullPath });
        }
      }
    }
  }
}

function deriveTeam(filePath: string): string {
  const parts = filePath.split(path.sep);
  const agentsIdx = parts.indexOf("agents");
  if (agentsIdx !== -1 && parts.length > agentsIdx + 1) {
    const teamCandidate = parts[agentsIdx + 1];
    if (teamCandidate && !teamCandidate.endsWith(".md")) {
      return teamCandidate;
    }
  }
  return "unknown";
}

main().catch(console.error);
