import fs from "node:fs";
import path from "node:path";
import { BLUE, log, NC, warn } from "./common.ts";

/** Max number of most-recent task entries included from memory.md in a prompt. */
export const MEMORY_PROMPT_TASK_CAP = 30;
/** Archive memory.md → memory.archive.md once total task entries exceed this. */
export const MEMORY_ARCHIVE_TASK_THRESHOLD = 100;
/** Rotate memory.archive.md → memory.archive.N.md once it crosses this size. */
export const MEMORY_ARCHIVE_ROTATE_BYTES = 2_000_000; // ~2 MB

/**
 * Keep only the header + last N `## Task #...` blocks from memory content.
 * Older tasks stay in memory.archive.md, not in the prompt.
 *
 * The archive notice is intentionally static (no per-run counter) so the
 * prompt prefix stays byte-for-byte identical across task iterations — that's
 * what lets Anthropic prompt caching kick in.
 */
export function capMemoryForPrompt(content: string, maxTasks: number): string {
  const splitIdx = content.search(/^## Task #/m);
  if (splitIdx === -1) return content;
  const header = content.slice(0, splitIdx).trimEnd();
  const tasksBlob = content.slice(splitIdx);
  const tasks = tasksBlob
    .split(/(?=^## Task #)/m)
    .filter((t) => t.trim().length > 0);
  if (tasks.length <= maxTasks) return content;
  const kept = tasks.slice(-maxTasks);
  const notice =
    "\n\n_(Older task entries archived in .claude-loop/memory.archive.md)_\n\n";
  return `${header}${notice}${kept.join("")}`;
}

/**
 * Rotate old task entries from memory.md to memory.archive.md when they
 * exceed MEMORY_ARCHIVE_TASK_THRESHOLD. Keeps the latest cap-worth in the
 * active file. Also rolls the archive itself when it grows too large.
 */
export function archiveOldMemoryTasks(memoryFile: string): void {
  if (!fs.existsSync(memoryFile)) return;
  const content = fs.readFileSync(memoryFile, "utf-8");
  const splitIdx = content.search(/^## Task #/m);
  if (splitIdx === -1) return;
  const header = content.slice(0, splitIdx).trimEnd();
  const tasks = content
    .slice(splitIdx)
    .split(/(?=^## Task #)/m)
    .filter((t) => t.trim().length > 0);
  if (tasks.length <= MEMORY_ARCHIVE_TASK_THRESHOLD) return;
  const keep = tasks.slice(-MEMORY_PROMPT_TASK_CAP);
  const archive = tasks.slice(0, -MEMORY_PROMPT_TASK_CAP);
  const archiveFile = path.join(path.dirname(memoryFile), "memory.archive.md");
  rotateArchiveIfOversize(archiveFile);
  const existingArchive = fs.existsSync(archiveFile)
    ? fs.readFileSync(archiveFile, "utf-8")
    : "# Memory Archive\n\nOlder task entries moved out of active memory.\n\n";
  fs.writeFileSync(archiveFile, existingArchive + archive.join(""));
  fs.writeFileSync(memoryFile, `${header}\n\n${keep.join("")}`);
  log(
    `Rotated ${archive.length} old task entries → ${BLUE}${archiveFile}${NC}`,
  );
}

/**
 * If memory.archive.md is over the size budget, rename it to the next free
 * memory.archive.N.md slot (1, 2, 3…). The active archive file is then left
 * missing, so the caller writes a fresh one.
 */
function rotateArchiveIfOversize(archiveFile: string): void {
  if (!fs.existsSync(archiveFile)) return;
  const stat = fs.statSync(archiveFile);
  if (stat.size < MEMORY_ARCHIVE_ROTATE_BYTES) return;
  const dir = path.dirname(archiveFile);
  for (let i = 1; i < 1000; i++) {
    const rotated = path.join(dir, `memory.archive.${i}.md`);
    if (!fs.existsSync(rotated)) {
      try {
        fs.renameSync(archiveFile, rotated);
        log(
          `Memory archive exceeded ${MEMORY_ARCHIVE_ROTATE_BYTES} bytes — rolled to ${BLUE}${rotated}${NC}`,
        );
      } catch (e) {
        warn(`Failed to rotate memory archive: ${(e as Error).message}`);
      }
      return;
    }
  }
  warn(
    "Memory archive rotation: ran out of slots (memory.archive.1.md..999.md all exist). Consider cleaning up old archives.",
  );
}
