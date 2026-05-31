// Vendored copy of the canonical TrueTrack engine in /src.
// Kept here so the web bundle builds standalone (no monorepo path dependency).
// Source of truth is /src; the engine is frozen for the demo.

export type Severity = "critical" | "high" | "medium" | "low";

export type AttributionModel =
  | "last-click"
  | "data-driven"
  | "position-based"
  | "unknown";

/** A normalized snapshot of a site's marketing measurement stack. */
export interface StackSnapshot {
  url: string;
  gtm: { webContainer: boolean; serverContainer: boolean; containerId?: string };
  ga4: {
    installed: boolean;
    viaServerSide: boolean;
    measurementProtocol: boolean;
    measurementId?: string;
  };
  metaPixel: { installed: boolean; capi: boolean; serverEvents: boolean; pixelId?: string };
  consentMode: { present: boolean; defaultDenied: boolean; blocksTagsWhenUnknown: boolean };
  attribution: { model: AttributionModel };
  enhancedConversions: boolean;
}

export interface CheckResult {
  id: string;
  title: string;
  passed: boolean;
  severity: Severity;
  /** Points removed from 100 when this check fails. */
  weight: number;
  /** Estimated share of conversions lost when this check fails. */
  conversionsLostPct: number;
  detail: string;
}

export type Check = (s: StackSnapshot) => CheckResult;

export interface Issue {
  id: string;
  title: string;
  severity: Severity;
  weight: number;
  conversionsLostPct: number;
  detail: string;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ScoreResult {
  url: string;
  score: number;
  grade: Grade;
  issues: Issue[];
  passed: string[];
  estimatedConversionsLostPct: number;
}
