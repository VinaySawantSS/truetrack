// Thin adapter over the vendored TrueTrack engine in ./engine.
// Those files are copies of /src (the engine used by the CLI, the MCP server,
// and the vitest suite). Vendoring them keeps the web bundle self-contained, so
// it builds anywhere regardless of folder layout. The demo numbers are identical
// to `npm run demo`: 41 -> 94, +34% recovered.
import { scoreStack } from "./engine/scoring";
import { generateFixes, applyFixes } from "./engine/fixer";
import type { Fix } from "./engine/fixer";
import type { ScoreResult, Issue, StackSnapshot } from "./engine/types";
import brokenJson from "./engine/fixtures/broken-store.json";

export type { ScoreResult, Issue, StackSnapshot, Fix };

export const brokenStack = brokenJson as unknown as StackSnapshot;

export interface DemoResult {
  before: ScoreResult;
  after: ScoreResult;
  fixes: Fix[];
  recoveredPct: number;
  resolvedIssueIds: string[];
}

/** Run the full scan -> score -> fix -> re-score loop on the broken fixture. */
export function runDemo(): DemoResult {
  const before = scoreStack(brokenStack);
  const fixes = generateFixes(before.issues);
  const after = scoreStack(applyFixes(brokenStack, fixes));
  const recoveredPct = Math.max(
    0,
    before.estimatedConversionsLostPct - after.estimatedConversionsLostPct,
  );
  const afterIds = new Set(after.issues.map((i) => i.id));
  const resolvedIssueIds = before.issues
    .filter((i) => !afterIds.has(i.id))
    .map((i) => i.id);
  return { before, after, fixes, recoveredPct, resolvedIssueIds };
}

export const STORE_HOST = "demo-broken-store.example";

export const SCAN_STEPS = [
  "Fetching tag configuration",
  "Detecting GTM web and server containers",
  "Inspecting GA4 install and transport",
  "Checking Meta Pixel and Conversions API",
  "Reading Consent Mode v2 defaults",
  "Probing server-side endpoint",
  "Compiling tracking health score",
];
