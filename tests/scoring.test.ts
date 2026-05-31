import { describe, it, expect } from "vitest";
import { scanFixture } from "../src/scanner/index.js";
import { scoreStack } from "../src/scoring/index.js";

describe("scoring (demo contract)", () => {
  it("scores the broken store at 41 with every check failing", () => {
    const r = scoreStack(scanFixture("broken-store"));
    expect(r.score).toBe(41);
    expect(r.grade).toBe("F");
    expect(r.issues.length).toBe(6);
    expect(r.estimatedConversionsLostPct).toBe(34);
  });

  it("scores the fixed store at 94 with one residual issue", () => {
    const r = scoreStack(scanFixture("fixed-store"));
    expect(r.score).toBe(94);
    expect(r.grade).toBe("A");
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].id).toBe("enhanced-conversions-off");
  });

  it("ranks issues by severity (critical first)", () => {
    const r = scoreStack(scanFixture("broken-store"));
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const seq = r.issues.map((i) => rank[i.severity]);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });
});
