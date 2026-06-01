import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { StackSnapshot } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "fixtures");

export type FixtureName = "broken-store" | "fixed-store";

/** Load a deterministic demo snapshot from /fixtures. */
export function scanFixture(name: FixtureName): StackSnapshot {
  const raw = readFileSync(join(fixturesDir, name, "stack.json"), "utf8");
  return JSON.parse(raw) as StackSnapshot;
}

// Live detection (Fast scan). Same StackSnapshot shape as scanFixture, so scoring
// and fixing are identical for live and fixture inputs. See ./live for guardrails,
// the observed-vs-assumed evidence model, and the runtime-portability notes.
export {
  scanSite,
  scanSiteWithEvidence,
  detectStack,
  normalizeUrl,
  assertPublicHttps,
  ScanError,
  type ScanEvidence,
  type ScanWithEvidence,
} from "./live.js";
