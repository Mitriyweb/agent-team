import { BLUE, CYAN, GREEN, NC, RED, YELLOW } from "./common.ts";

export class TerminalUI {
  private spinnerFrame = 0;
  private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private startTime: number = Date.now();

  static formatDuration(ms: number): string {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  showProgressBar(
    taskId: string,
    _desc: string,
    current: number,
    total: number | string,
    counts: { done: number; failed: number },
  ) {
    const elapsed = Date.now() - this.startTime;
    const elapsedFmt = TerminalUI.formatDuration(elapsed);
    const frame = this.spinnerFrames[this.spinnerFrame];
    this.spinnerFrame = (this.spinnerFrame + 1) % this.spinnerFrames.length;

    const statusLine = `${frame} ${CYAN}[${current}/${total}]${NC} Task ${BLUE}#${taskId}${NC} running... ${YELLOW}${elapsedFmt}${NC}  ┃  ${GREEN}✓${counts.done}${NC} ${RED}✗${counts.failed}${NC}`;
    const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const cleanLine = statusLine.replace(ansiRegex, "");
    const cols = process.stdout.columns || 80;

    if (cleanLine.length > cols) {
      const shortLine = `${frame} ${CYAN}[${current}/${total}]${NC} #${taskId} ${YELLOW}${elapsedFmt}${NC} ${GREEN}✓${counts.done}${NC} ${RED}✗${counts.failed}${NC}`;
      process.stderr.write(`\r\x1b[K${shortLine}`);
    } else {
      process.stderr.write(`\r\x1b[K${statusLine}`);
    }
  }

  stopProgressBar() {
    process.stderr.write("\r\x1b[K");
  }

  static printDashboard(counts: {
    done: number;
    failed: number;
    pending: number;
    running: number;
    total: number;
  }) {
    console.log("");
    console.log(`  ${CYAN}┌─────────────────────────────────┐${NC}`);
    console.log(
      `  ${CYAN}│${NC}  ${GREEN}✓ Done:${NC}    ${counts.done.toString().padEnd(20)} ${CYAN}│${NC}`,
    );
    console.log(
      `  ${CYAN}│${NC}  ${RED}✗ Failed:${NC}  ${counts.failed.toString().padEnd(20)} ${CYAN}│${NC}`,
    );
    console.log(
      `  ${CYAN}│${NC}  ${YELLOW}○ Pending:${NC} ${counts.pending.toString().padEnd(20)} ${CYAN}│${NC}`,
    );
    console.log(
      `  ${CYAN}│${NC}  ${BLUE}~ Running:${NC} ${counts.running.toString().padEnd(20)} ${CYAN}│${NC}`,
    );
    console.log(
      `  ${CYAN}│${NC}  Total:    ${counts.total.toString().padEnd(20)} ${CYAN}│${NC}`,
    );
    console.log(`  ${CYAN}└─────────────────────────────────┘${NC}`);
    console.log("");
  }
}
