import { scanFixture, scanSite, type FixtureName } from "../scanner/index.js";
import { scoreStack } from "../scoring/index.js";
import { generateFixes, applyFixes, type Fix } from "../fixer/index.js";
import type { Issue, ScoreResult, StackSnapshot } from "../types.js";

/** Tool descriptors exposed by the TrueTrack MCP server. */
export const tools = [
  { name: "scan_site", description: "Detect the measurement stack for a URL or demo fixture." },
  { name: "score_site", description: "Return a 0-100 Tracking Health Score with prioritized issues." },
  { name: "generate_fixes", description: "Generate concrete remediation for the detected issues." },
  { name: "apply_fixes", description: "Apply fixes and re-score to prove the recovery." },
] as const;

export async function handleScanSite(input: { url?: string; fixture?: FixtureName }): Promise<StackSnapshot> {
  if (input.fixture) return scanFixture(input.fixture);
  if (input.url) return scanSite(input.url);
  throw new Error("Provide a url or a fixture name.");
}

export function handleScoreSite(input: { snapshot: StackSnapshot }): ScoreResult {
  return scoreStack(input.snapshot);
}

export function handleGenerateFixes(input: { issues: Issue[] }): Fix[] {
  return generateFixes(input.issues);
}

export function handleApplyFixes(input: { snapshot: StackSnapshot; fixes: Fix[] }): {
  before: ScoreResult;
  after: ScoreResult;
} {
  const before = scoreStack(input.snapshot);
  const after = scoreStack(applyFixes(input.snapshot, input.fixes));
  return { before, after };
}

// TODO (Phase 4): bind these handlers to an MCP transport on Cloudflare Workers
// (workers-mcp / @modelcontextprotocol/sdk) and export the Worker fetch handler.
