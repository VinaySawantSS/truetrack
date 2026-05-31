import { describe, it, expect } from "vitest";
import { scanFixture } from "../src/scanner/index.js";
import { scoreStack } from "../src/scoring/index.js";
import { generateFixes, applyFixes } from "../src/fixer/index.js";

describe("fixer + recovery loop", () => {
  it("generates a fix with a non-empty config for each fixable issue", () => {
    const before = scoreStack(scanFixture("broken-store"));
    const fixes = generateFixes(before.issues);
    expect(fixes.length).toBe(5); // all but enhanced-conversions
    for (const f of fixes) expect(f.config.length).toBeGreaterThan(0);
  });

  it("recovers the broken store from 41 to 94 after applying fixes", () => {
    const broken = scanFixture("broken-store");
    const before = scoreStack(broken);
    const after = scoreStack(applyFixes(broken, generateFixes(before.issues)));
    expect(before.score).toBe(41);
    expect(after.score).toBe(94);
  });
});
