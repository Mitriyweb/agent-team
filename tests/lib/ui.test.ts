import { describe, it, spyOn } from "bun:test";
import { TerminalUI } from "../../lib/ui.ts";

describe("ui.ts", () => {
  it("covers UI", () => {
    TerminalUI.formatDuration(1000);
    const ui = new TerminalUI();
    const stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      () => true,
    );
    ui.showProgressBar("1", "d", 1, 10, { done: 0, failed: 0 });
    ui.stopProgressBar();
    TerminalUI.printDashboard({
      done: 1,
      failed: 0,
      pending: 0,
      running: 0,
      total: 1,
    });
    stderrSpy.mockRestore();
  });
});
