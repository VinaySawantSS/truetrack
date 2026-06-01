// TrueTrack Fast scan endpoint (Cloudflare Pages Function).
//
// POST /api/scan  { "url": "https://example.com", "token"?: "<turnstile>" }
// Runs the same engine the CLI and MCP server use: fetch -> detect -> score ->
// generate fixes -> apply -> re-score. Returns observed-vs-assumed evidence so the
// UI can show exactly what was proven from the page source.
//
// Turnstile and rate-limiting are OPTIONAL and degrade gracefully: the endpoint
// works with neither bound, so it ships today. Turn them on later by setting
// TURNSTILE_SECRET (secret) and binding a KV namespace as RATE_LIMIT.

import { scanSiteWithEvidence, ScanError } from "../../src/engine/live";
import { scoreStack } from "../../src/engine/scoring";
import { generateFixes, applyFixes } from "../../src/engine/fixer";

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  TURNSTILE_SECRET?: string;
  RATE_LIMIT?: KVNamespace;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

// Per-IP soft limits. Only enforced when a KV namespace is bound as RATE_LIMIT.
const PER_MINUTE = 12;
const PER_DAY = 150;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// Returns true when the request is over budget. Fails open: any KV hiccup allows
// the request rather than blocking a real user (or a judge) mid-demo.
async function isRateLimited(kv: KVNamespace, ip: string): Promise<boolean> {
  try {
    const minKey = "rl:min:" + ip;
    const dayKey = "rl:day:" + ip;
    const [minRaw, dayRaw] = await Promise.all([kv.get(minKey), kv.get(dayKey)]);
    const minCount = minRaw ? parseInt(minRaw, 10) || 0 : 0;
    const dayCount = dayRaw ? parseInt(dayRaw, 10) || 0 : 0;
    if (minCount >= PER_MINUTE || dayCount >= PER_DAY) return true;
    await Promise.all([
      kv.put(minKey, String(minCount + 1), { expirationTtl: 60 }),
      kv.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 }),
    ]);
    return false;
  } catch {
    return false;
  }
}

export const onRequestPost = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP");

  let payload: { url?: unknown; token?: unknown };
  try {
    payload = (await request.json()) as { url?: unknown; token?: unknown };
  } catch {
    return json({ ok: false, error: "Send a JSON body like { \"url\": \"https://example.com\" }." }, 400);
  }

  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (url.length === 0) {
    return json({ ok: false, error: "Please include a url to scan." }, 400);
  }

  if (env.TURNSTILE_SECRET) {
    const token = typeof payload.token === "string" ? payload.token : "";
    if (!token || !(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip))) {
      return json({ ok: false, error: "Human check failed. Please retry." }, 403);
    }
  }

  if (env.RATE_LIMIT && ip) {
    if (await isRateLimited(env.RATE_LIMIT, ip)) {
      return json(
        { ok: false, error: "You are scanning quite fast. Give it a minute and try again." },
        429,
      );
    }
  }

  try {
    const { snapshot, evidence, requestedUrl, finalUrl, thin } = await scanSiteWithEvidence(url);
    const before = scoreStack(snapshot);
    const fixes = generateFixes(before.issues);
    const after = scoreStack(applyFixes(snapshot, fixes));
    const recoveredPct = Math.max(
      0,
      before.estimatedConversionsLostPct - after.estimatedConversionsLostPct,
    );
    const afterIds = new Set(after.issues.map((i) => i.id));
    const resolvedIssueIds = before.issues.filter((i) => !afterIds.has(i.id)).map((i) => i.id);

    let host = finalUrl;
    try {
      host = new URL(finalUrl).host;
    } catch {
      /* keep finalUrl as-is */
    }

    return json({
      ok: true,
      host,
      scannedUrl: finalUrl,
      requestedUrl,
      thin,
      evidence,
      before,
      after,
      fixes,
      recoveredPct,
      resolvedIssueIds,
    });
  } catch (err) {
    if (err instanceof ScanError) {
      return json({ ok: false, error: err.message, code: err.code }, err.status ?? 400);
    }
    return json({ ok: false, error: "The scan failed unexpectedly. Try another URL." }, 500);
  }
};

export const onRequestGet = async (): Promise<Response> => {
  return json({
    ok: true,
    service: "truetrack-fast-scan",
    usage: "POST /api/scan with { url } to scan a live site.",
  });
};
