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

/**
 * TODO (Phase 1): live detection. Fetch the page and parse the gtag/GTM and
 * Meta Pixel snippets, read the dataLayer purchase schema and consent state,
 * and probe the server-side endpoint. Returns the same StackSnapshot shape so
 * scoring and fixing are identical for live and fixture inputs.
 */
export async function scanSite(_url: string): Promise<StackSnapshot> {
  throw new Error(
    "Live scan is not implemented in the scaffold. Use scanFixture() for the demo loop.",
  );
}
