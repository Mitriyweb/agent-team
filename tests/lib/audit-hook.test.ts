import { afterEach, describe, it, mock, spyOn } from "bun:test";
import fs from "node:fs";
import { runAuditHook } from "../../lib/audit-hook.ts";

describe("audit-hook.ts", () => {
  afterEach(() => {
    mock.restore();
  });

  it("runs audit hook for PRE and POST", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock implementation
    spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    spyOn(fs, "appendFileSync").mockImplementation(() => undefined);

    const mockStdin = (input: string) =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(input));
          controller.close();
        },
      });

    const streamSpy = spyOn(Bun.stdin, "stream");

    streamSpy.mockReturnValue(mockStdin('{"tool":"t"}'));
    await runAuditHook("PRE");

    streamSpy.mockReturnValue(
      mockStdin('{"tool":"t","status":"s","duration_ms":1}'),
    );
    await runAuditHook("POST");

    // Test default status/duration
    streamSpy.mockReturnValue(mockStdin("{}"));
    await runAuditHook("POST");
  });
});
