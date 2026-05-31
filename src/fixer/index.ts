import type { Issue, StackSnapshot } from "../types.js";

export type FixType =
  | "consent-mode"
  | "sgtm-config"
  | "meta-capi"
  | "ga4-measurement-protocol"
  | "attribution";

export interface Fix {
  issueId: string;
  type: FixType;
  title: string;
  /** Concrete, paste-ready remediation snippet. */
  config: string;
}

const templates: Record<string, () => Fix> = {
  "consent-mode-blocking": () => ({
    issueId: "consent-mode-blocking",
    type: "consent-mode",
    title: "Reconfigure Consent Mode v2 defaults",
    config: [
      "gtag('consent', 'default', {",
      "  ad_storage: 'denied',",
      "  analytics_storage: 'denied',",
      "  ad_user_data: 'denied',",
      "  ad_personalization: 'denied',",
      "  wait_for_update: 500",
      "});",
      "gtag('set', 'url_passthrough', true);",
      "gtag('set', 'ads_data_redaction', true);",
      "// fire tags in granted/modeled states instead of blocking on unknown",
    ].join("\n"),
  }),
  "no-server-container": () => ({
    issueId: "no-server-container",
    type: "sgtm-config",
    title: "Provision a server-side GTM container",
    config: [
      "# Cloudflare Worker / server-side GTM endpoint (first-party subdomain)",
      "POST https://sgtm.yourdomain.com/g/collect",
      "# Route GA4, Google Ads, and Meta through the first-party server transport.",
      "# Set a long-lived first-party cookie server-side to survive ITP.",
    ].join("\n"),
  }),
  "meta-capi-missing": () => ({
    issueId: "meta-capi-missing",
    type: "meta-capi",
    title: "Add Meta Conversions API with event de-duplication",
    config: JSON.stringify(
      {
        event_name: "Purchase",
        event_id: "{{order_id}}",
        action_source: "website",
        event_source_url: "{{page_url}}",
        user_data: { em: "{{sha256_email}}", ph: "{{sha256_phone}}" },
        custom_data: { currency: "USD", value: "{{order_value}}" },
      },
      null,
      2,
    ),
  }),
  "ga4-not-server-side": () => ({
    issueId: "ga4-not-server-side",
    type: "ga4-measurement-protocol",
    title: "Send server-confirmed purchases via GA4 Measurement Protocol",
    config: JSON.stringify(
      {
        client_id: "{{client_id}}",
        events: [
          {
            name: "purchase",
            params: { transaction_id: "{{order_id}}", value: "{{order_value}}", currency: "USD" },
          },
        ],
      },
      null,
      2,
    ),
  }),
  "attribution-last-click": () => ({
    issueId: "attribution-last-click",
    type: "attribution",
    title: "Switch reporting to data-driven attribution",
    config: [
      "# GA4 Admin > Attribution settings",
      "#   Reporting attribution model: Data-driven",
      "# Google Ads: align conversion attribution to data-driven.",
    ].join("\n"),
  }),
  // enhanced-conversions-off intentionally has no auto-fix in the scaffold;
  // it is surfaced as the recommended next optimization (the last 6 points).
};

export function generateFixes(issues: Issue[]): Fix[] {
  return issues.filter((i) => templates[i.id]).map((i) => templates[i.id]());
}

/** Apply the generated fixes to a snapshot and return the corrected twin. */
export function applyFixes(snapshot: StackSnapshot, fixes: Fix[]): StackSnapshot {
  const next: StackSnapshot = structuredClone(snapshot);
  const ids = new Set(fixes.map((f) => f.issueId));
  if (ids.has("consent-mode-blocking")) next.consentMode.blocksTagsWhenUnknown = false;
  if (ids.has("no-server-container")) next.gtm.serverContainer = true;
  if (ids.has("meta-capi-missing")) {
    next.metaPixel.capi = true;
    next.metaPixel.serverEvents = true;
  }
  if (ids.has("ga4-not-server-side")) {
    next.ga4.viaServerSide = true;
    next.ga4.measurementProtocol = true;
  }
  if (ids.has("attribution-last-click")) next.attribution.model = "data-driven";
  return next;
}
