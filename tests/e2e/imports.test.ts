import { describe, expect, it } from "bun:test";
import ARCHITECTURE_TEMPLATE from "../../lib/templates/architecture.md" with {
  type: "text",
};
import SKILL_TEMPLATE from "../../lib/templates/skill.md" with { type: "text" };

describe("Template Imports", () => {
  it("should import ARCHITECTURE_TEMPLATE as string", () => {
    expect(typeof ARCHITECTURE_TEMPLATE).toBe("string");
    expect(ARCHITECTURE_TEMPLATE).toContain("# agent-team Architecture");
  });

  it("should import SKILL_TEMPLATE as string", () => {
    expect(typeof SKILL_TEMPLATE).toBe("string");
    expect(SKILL_TEMPLATE).toContain("# agent-team Skill");
  });
});
