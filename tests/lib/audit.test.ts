import { describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import { auditReport } from "../../lib/audit.ts";

describe("audit.ts", () => {
  it("generates audit report", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        ts: "..",
        phase: "POST",
        agent: "a",
        tool: "t",
        status: "success",
        duration_ms: 10,
      }) +
        "\n" +
        JSON.stringify({
          ts: "..",
          phase: "POST",
          agent: "b",
          tool: "t2",
          status: "error",
          duration_ms: 20,
        }) +
        "\n" +
        "invalid\n",
    );

    auditReport();
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles missing log file", () => {
    spyOn(fs, "existsSync").mockReturnValue(false);
    auditReport();
  });

  it("handles empty log file", () => {
    spyOn(fs, "existsSync").mockReturnValue(true);
    spyOn(fs, "readFileSync").mockReturnValue("");
    auditReport();
  });
});
