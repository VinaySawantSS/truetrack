import { describe, it, expect } from "vitest";
import { scanFixture } from "../src/scanner/index.js";

describe("scanner", () => {
  it("loads the broken fixture into a StackSnapshot", () => {
    const s = scanFixture("broken-store");
    expect(s.url).toContain("broken");
    expect(s.gtm.serverContainer).toBe(false);
    expect(s.consentMode.blocksTagsWhenUnknown).toBe(true);
  });

  it("loads the fixed fixture into a StackSnapshot", () => {
    const s = scanFixture("fixed-store");
    expect(s.gtm.serverContainer).toBe(true);
    expect(s.metaPixel.capi).toBe(true);
    expect(s.attribution.model).toBe("data-driven");
  });
});
