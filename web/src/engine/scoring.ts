// Vendored copy of the canonical TrueTrack engine in /src.
// Kept here so the web bundle builds standalone (no monorepo path dependency).
// Source of truth is /src; the engine is frozen for the demo.

import type { Check, CheckResult, Grade, Issue, ScoreResult, Severity, StackSnapshot } from "./types";

/**
 * Phase 1 surface: expand this list and tune weights against real client data.
 * Each check inspects the stack and reports whether a known conversion-loss
 * failure mode is present. Weights are points removed from 100 on failure.
 */
export const checks: Check[] = [
  (s) => ({
    id: "consent-mode-blocking",
    title: "Consent Mode blocking GA4 before user choice",
    passed: !(s.consentMode.present && s.consentMode.defaultDenied && s.consentMode.blocksTagsWhenUnknown),
    severity: "critical",
    weight: 20,
    conversionsLostPct: 12,
    detail:
      "Tags are blocked while consent state is unknown, dropping events from users who never interact with the banner.",
  }),
  (s) => ({
    id: "no-server-container",
    title: "No server-side GTM container",
    passed: s.gtm.serverContainer,
    severity: "high",
    weight: 15,
    conversionsLostPct: 8,
    detail:
      "Without a server container, events are exposed to ITP and ad-blockers and cannot be enriched or de-duplicated.",
  }),
  (s) => ({
    id: "meta-capi-missing",
    title: "Meta Pixel client-only, no Conversions API",
    passed: s.metaPixel.installed ? s.metaPixel.capi : true,
    severity: "high",
    weight: 10,
    conversionsLostPct: 7,
    detail:
      "A browser-only pixel loses signal to ITP and ad-blockers; CAPI recovers server-confirmed conversions.",
  }),
  (s) => ({
    id: "ga4-not-server-side",
    title: "GA4 not receiving server-side / Measurement Protocol hits",
    passed: s.ga4.installed ? s.ga4.viaServerSide || s.ga4.measurementProtocol : false,
    severity: "high",
    weight: 5,
    conversionsLostPct: 5,
    detail: "Purchases confirmed on the server never reach GA4, so revenue is undercounted.",
  }),
  (s) => ({
    id: "attribution-last-click",
    title: "Attribution locked to last-click",
    passed: s.attribution.model !== "last-click",
    severity: "medium",
    weight: 3,
    conversionsLostPct: 2,
    detail: "Last-click hides assisted conversions and misallocates budget across channels.",
  }),
  (s) => ({
    id: "enhanced-conversions-off",
    title: "Enhanced Conversions not configured",
    passed: s.enhancedConversions,
    severity: "low",
    weight: 6,
    conversionsLostPct: 0,
    detail: "Hashed first-party data is not being sent, weakening match rates and modeling.",
  }),
  // TODO (Phase 1): cross-domain linker, gclid/fbclid capture, duplicate
  // pageviews, dataLayer purchase schema, cookie lifespan under ITP, and
  // server event de-duplication keys.
];

function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function scoreStack(snapshot: StackSnapshot): ScoreResult {
  const results: CheckResult[] = checks.map((c) => c(snapshot));
  const failed = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed).map((r) => r.id);

  const penalty = failed.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const issues: Issue[] = [...failed]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.weight - a.weight)
    .map(({ id, title, severity, weight, conversionsLostPct, detail }) => ({
      id,
      title,
      severity,
      weight,
      conversionsLostPct,
      detail,
    }));

  const estimatedConversionsLostPct = Math.min(
    60,
    failed.reduce((sum, r) => sum + r.conversionsLostPct, 0),
  );

  return { url: snapshot.url, score, grade: gradeFor(score), issues, passed, estimatedConversionsLostPct };
}
