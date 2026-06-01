// TrueTrack live scanner (Fast scan, beta).
//
// Turns a public URL into the SAME StackSnapshot shape that scanFixture()
// returns, so scoring, fixing, and the re-scan loop are identical for live and
// fixture inputs. Uses only WHATWG fetch + streams, so this exact file runs in
// Node 22+ and in a Cloudflare Worker (Pages Function).
//
// Honest by design. A static fetch only sees what the page serves. Anything we
// cannot confirm client-side (server-side GTM, Meta CAPI, GA4 Measurement
// Protocol, attribution model) is recorded as a conservative ASSUMPTION, never
// asserted as fact. Every decision lands in ScanEvidence so the UI can label
// confirmed vs assumed. Sites that inject their tags dynamically come back thin
// and need the headless Deep scan; this file is the Fast scan.
//
// Vendored under web/src/engine to match the rest of the engine. Source of
// truth is /src; keep the two in sync.

import type { AttributionModel, StackSnapshot } from "./types";

export interface ScanEvidence {
  observed: string[];
  assumed: string[];
}

export interface ScanWithEvidence {
  snapshot: StackSnapshot;
  evidence: ScanEvidence;
  requestedUrl: string;
  finalUrl: string;
  /** True when detection is thin (little observed): result is low-confidence. */
  thin: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB streamed cap
const UA =
  "Mozilla/5.0 (compatible; TrueTrackBot/1.0; +https://truetrack.pages.dev)";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScanError extends Error {
  code: string;
  /** HTTP status an API layer should surface. Defaults to 400 (client error). */
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "ScanError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// URL guardrails (SSRF-conservative)
// ---------------------------------------------------------------------------

export function normalizeUrl(input: string): string {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) throw new ScanError("Enter a URL to scan.", "empty-url");
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    throw new ScanError(`That does not look like a valid URL: ${input}`, "bad-url");
  }
}

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n > 255)) return true; // malformed, treat as unsafe
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  let h = host;
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const lower = h.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
  const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped && isPrivateIPv4(mapped[1])) return true;
  return false;
}

export function assertPublicHttps(rawUrl: string): URL {
  const u = new URL(rawUrl);
  if (u.protocol !== "https:") {
    throw new ScanError("Only public https:// URLs can be scanned.", "not-https");
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new ScanError("That host is not publicly reachable.", "private-host");
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new ScanError("That address is in a private or reserved range.", "private-ip");
  }
  // Note: a public hostname that resolves to a private IP (DNS rebinding) is a
  // deeper SSRF class the static fetch cannot fully pin. The Deep scan runs in
  // an isolated browser; for the Fast scan beta these literal checks plus the
  // 10s timeout and 2MB cap keep the blast radius to fetching public pages.
  return u;
}

// ---------------------------------------------------------------------------
// Capped, timed fetch (WHATWG streams only)
// ---------------------------------------------------------------------------

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return await res.text();
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      const keep = Math.max(0, value.byteLength - (received - maxBytes));
      out += decoder.decode(value.subarray(0, keep), { stream: true });
      try {
        await reader.cancel();
      } catch {
        /* noop */
      }
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

interface FetchedDoc {
  text: string;
  finalUrl: string;
}

async function fetchText(url: string, timeoutMs: number): Promise<FetchedDoc> {
  assertPublicHttps(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    if (res.url) assertPublicHttps(res.url); // re-check after redirects
    if (!res.ok) throw new ScanError(`The site returned HTTP ${res.status}.`, `http-${res.status}`, 502);
    const text = await readCapped(res, MAX_BYTES);
    return { text, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof ScanError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new ScanError("The site took too long to respond (10s timeout).", "timeout", 504);
    }
    throw new ScanError(`Could not fetch the site: ${(err as Error).message}`, "fetch-failed", 502);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Detection (pure)
// ---------------------------------------------------------------------------

const GTM_ID = /GTM-[A-Z0-9]{4,}/;
const GA4_ID = /\bG-[A-Z0-9]{6,10}\b/;
const FBQ_INIT = /fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]/;

function sliceAround(text: string, re: RegExp, span: number): string {
  const m = text.match(re);
  if (!m || m.index == null) return "";
  const start = Math.max(0, m.index - 40);
  return text.slice(start, m.index + span);
}

function detectCmp(hay: string): string | null {
  const cmps: Array<[RegExp, string]> = [
    [/onetrust|optanon|otsdkstub/i, "OneTrust"],
    [/cookiebot/i, "Cookiebot"],
    [/usercentrics/i, "Usercentrics"],
    [/trustarc|consent\.truste/i, "TrustArc"],
    [/iubenda/i, "Iubenda"],
    [/cookieyes/i, "CookieYes"],
    [/osano/i, "Osano"],
    [/didomi/i, "Didomi"],
    [/sourcepoint|sp_(prod|ccpa|gdpr)/i, "Sourcepoint"],
    [/quantcast|cmp\.choice/i, "Quantcast"],
    [/termly/i, "Termly"],
    [/klaro/i, "Klaro"],
  ];
  for (const [re, name] of cmps) if (re.test(hay)) return name;
  return null;
}

export function detectStack(
  html: string,
  requestedUrl: string,
  finalUrl: string,
): ScanWithEvidence {
  const observed: string[] = [];
  const assumed: string[] = [];
  const hay = html;

  // GTM web container
  const gtmMatch = hay.match(GTM_ID);
  const gtmWeb = Boolean(gtmMatch) || /googletagmanager\.com\/gtm\.js/.test(hay);
  const containerId = gtmMatch?.[0];
  if (gtmWeb) observed.push(`GTM web container${containerId ? ` ${containerId}` : ""}`);
  else assumed.push("No GTM web container in the served HTML");

  // Server-side container: only credited if a first-party transport is visible.
  const transportMatch = hay.match(/transport_url['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
  let serverContainer = false;
  if (transportMatch && !/googletagmanager\.com/i.test(transportMatch[1])) {
    serverContainer = true;
    observed.push(`Server-side transport (${transportMatch[1]})`);
  } else {
    assumed.push("Server-side GTM container: assumed off (not visible client-side)");
  }

  // GA4
  const ga4Match = hay.match(GA4_ID);
  const ga4Installed =
    Boolean(ga4Match) || /gtag\/js\?id=G-/.test(hay) || /googletagmanager\.com\/gtag\/js/.test(hay);
  const measurementId = ga4Match?.[0];
  if (ga4Installed) observed.push(`GA4${measurementId ? ` ${measurementId}` : ""}`);
  else assumed.push("No GA4 tag in the served HTML");
  assumed.push("GA4 server-side / Measurement Protocol: assumed off (not visible client-side)");

  // Meta Pixel
  const fbqMatch = hay.match(FBQ_INIT);
  const metaInstalled =
    Boolean(fbqMatch) ||
    /connect\.facebook\.net\/[^"']*\/fbevents\.js/.test(hay) ||
    /fbq\(\s*['"]init['"]/.test(hay);
  const pixelId = fbqMatch?.[1];
  if (metaInstalled) observed.push(`Meta Pixel${pixelId ? ` id ${pixelId}` : ""}`);
  else assumed.push("No Meta Pixel in the served HTML");
  if (metaInstalled) {
    assumed.push("Meta Conversions API: assumed off (server-side, not detectable client-side)");
  }

  // Consent Mode + common CMPs
  const consentDefault =
    /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/.test(hay) ||
    /['"]consent['"]\s*,\s*['"]default['"]/.test(hay);
  const cmp = detectCmp(hay);
  const consentPresent = consentDefault || Boolean(cmp);

  let defaultDenied = false;
  if (consentDefault) {
    const region = sliceAround(hay, /['"]consent['"]\s*,\s*['"]default['"]/, 400);
    defaultDenied = /denied/.test(region);
  }
  const waitForUpdate = /wait_for_update/.test(hay);
  const consentUpdate =
    /gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]/.test(hay) ||
    /['"]consent['"]\s*,\s*['"]update['"]/.test(hay);
  const blocksTagsWhenUnknown = defaultDenied && !waitForUpdate && !consentUpdate;

  if (consentPresent) {
    observed.push(
      `Consent Mode present${cmp ? ` (CMP: ${cmp})` : ""}${defaultDenied ? ", default denied" : ""}`,
    );
    if (blocksTagsWhenUnknown) {
      observed.push("Default denies storage with no wait_for_update or update call (tags blocked while unknown)");
    } else if (defaultDenied) {
      observed.push("Default denied, but a wait_for_update / update path is present (tags not hard-blocked)");
    }
  } else {
    assumed.push("No Consent Mode signal found (treated as not blocking)");
  }

  // Enhanced Conversions
  const enhanced =
    /enhanced_conversion/i.test(hay) ||
    /allow_enhanced_conversions/i.test(hay) ||
    /['"]enhanced_conversions['"]/i.test(hay);
  if (enhanced) observed.push("Enhanced Conversions configured");
  else assumed.push("Enhanced Conversions: not detected");

  // Attribution is never visible client-side: unknown, no penalty.
  const attribution: AttributionModel = "unknown";
  assumed.push("Attribution model: unknown (no penalty applied)");

  const snapshot: StackSnapshot = {
    url: finalUrl || requestedUrl,
    gtm: { webContainer: gtmWeb, serverContainer, ...(containerId ? { containerId } : {}) },
    ga4: {
      installed: ga4Installed,
      viaServerSide: false,
      measurementProtocol: false,
      ...(measurementId ? { measurementId } : {}),
    },
    metaPixel: {
      installed: metaInstalled,
      capi: false,
      serverEvents: false,
      ...(pixelId ? { pixelId } : {}),
    },
    consentMode: { present: consentPresent, defaultDenied, blocksTagsWhenUnknown },
    attribution: { model: attribution },
    enhancedConversions: enhanced,
  };

  // Thin when nothing concrete was observed (no GTM, no GA4, no pixel).
  const thin = !gtmWeb && !ga4Installed && !metaInstalled;

  return {
    snapshot,
    evidence: { observed, assumed },
    requestedUrl,
    finalUrl: finalUrl || requestedUrl,
    thin,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function scanSiteWithEvidence(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<ScanWithEvidence> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requested = normalizeUrl(url);
  const page = await fetchText(requested, timeoutMs);

  let combined = page.text;
  const gtmId = page.text.match(GTM_ID)?.[0];
  let containerFetched = false;
  if (gtmId) {
    try {
      const container = await fetchText(
        `https://www.googletagmanager.com/gtm.js?id=${gtmId}`,
        timeoutMs,
      );
      combined = `${page.text}\n/* gtm container ${gtmId} */\n${container.text}`;
      containerFetched = true;
    } catch {
      // best-effort; fall back to page HTML only
    }
  }

  const result = detectStack(combined, requested, page.finalUrl);
  if (containerFetched) {
    result.evidence.observed.push(
      `Fetched the public GTM container (${gtmId}) to recover tags GTM injects at runtime`,
    );
  } else if (gtmId) {
    result.evidence.assumed.push(
      "Could not load the GTM container; detection is based on the page HTML only",
    );
  }
  return result;
}

/** Convenience: just the snapshot, matching scanFixture()'s return shape. */
export async function scanSite(url: string): Promise<StackSnapshot> {
  const { snapshot } = await scanSiteWithEvidence(url);
  return snapshot;
}
