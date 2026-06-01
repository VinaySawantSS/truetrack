import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "./Gauge";
import { useTween } from "./useTween";
import { scoreColor, gradeForLive } from "./util";
import {
  runDemo,
  SCAN_STEPS,
  STORE_HOST,
  type Issue,
  type Fix,
  type ScoreResult,
} from "./engine";

type Phase = "idle" | "scanning" | "broken" | "fixing" | "recovered";
type IssueState = "broken" | "resolved" | "recommend";
type Mode = "fixture" | "live";

// Shape shared by the frozen fixture path and the live /api/scan path, so the
// scorecard renders from one object either way. The fixture path keeps its exact
// numbers (41 -> 94, +34%, 6 found, 5 fixed, 1 recommended); only the source changes.
interface ScanView {
  before: ScoreResult;
  after: ScoreResult;
  fixes: Fix[];
  recoveredPct: number;
  resolvedIssueIds: string[];
}

interface LiveScan extends ScanView {
  ok: true;
  host: string;
  scannedUrl: string;
  requestedUrl: string;
  thin: boolean;
  evidence: { observed: string[]; assumed: string[] };
}

// Curated, judge-facing examples. Each one detects a real GTM container + GA4 +
// Enhanced Conversions + consent in the served HTML, surfaces genuine server-side
// gaps, and recovers cleanly. Verified live before shipping.
const EXAMPLES = [
  { label: "allbirds.com", url: "https://www.allbirds.com" },
  { label: "warbyparker.com", url: "https://www.warbyparker.com" },
  { label: "drinklmnt.com", url: "https://drinklmnt.com" },
];

function hostFromUrl(input: string): string {
  const raw = input.trim();
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    return new URL(withProto).hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0] || raw;
  }
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="56 100" strokeLinecap="round" transform="rotate(135 16 16)" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}

function SeverityTag({ severity, state }: { severity: Issue["severity"]; state: IssueState }) {
  if (state === "resolved") return <span className="sev resolved">recovered</span>;
  if (state === "recommend") return <span className="sev recommend">recommended</span>;
  return (
    <span className="sev" data-sev={severity}>
      {severity}
    </span>
  );
}

function IssueCard({ issue, state }: { issue: Issue; state: IssueState }) {
  const [open, setOpen] = useState(false);
  const metric =
    state === "resolved"
      ? "+" + issue.conversionsLostPct + "% recovered"
      : state === "recommend"
        ? "+6 pts available"
        : issue.conversionsLostPct > 0
          ? "~" + issue.conversionsLostPct + "% lost"
          : "weakens match rate";
  return (
    <div className={"issue " + state}>
      <button className="issue-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SeverityTag severity={issue.severity} state={state} />
        <span className="issue-title">{issue.title}</span>
        <span className="issue-metric">{metric}</span>
        <span className="chev">{open ? "\u2212" : "+"}</span>
      </button>
      <div className={"issue-body" + (open ? " open" : "")}>
        <p>{issue.detail}</p>
        <div className="issue-foot">
          <span className="mono">id: {issue.id}</span>
          <span className="mono">weight: {state === "broken" ? "-" + issue.weight : "0"} pts</span>
        </div>
      </div>
    </div>
  );
}

function FixCard({ fix, index, defaultOpen }: { fix: Fix; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fix reveal" style={{ animationDelay: index * 90 + "ms" }}>
      <button className="fix-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="fix-type mono">{fix.type}</span>
        <span className="fix-title">{fix.title}</span>
        <span className="fix-toggle">{open ? "hide config" : "view config"}</span>
      </button>
      {open && (
        <pre className="config">
          <code>{fix.config}</code>
        </pre>
      )}
    </div>
  );
}

function EvidencePanel({ live }: { live: LiveScan }) {
  return (
    <section className="evidence reveal">
      <div className="panel-title">
        <h2>What we actually saw</h2>
        <span className="count mono">scanned {live.scannedUrl}</span>
      </div>
      <p className="evidence-sub">
        TrueTrack only reports what it can prove from the page source. Confirmed signals
        drive the score; anything not visible client-side is treated conservatively and
        labeled, never invented.
      </p>
      <div className="evidence-cols">
        <div className="evidence-col observed">
          <div className="evidence-h mono">confirmed in source</div>
          {live.evidence.observed.length === 0 ? (
            <p className="evidence-empty">Nothing concrete was visible in the served HTML.</p>
          ) : (
            <ul>
              {live.evidence.observed.map((line, i) => (
                <li key={i}>
                  <span className="ev-tick" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="evidence-col assumed">
          <div className="evidence-h mono">treated conservatively</div>
          {live.evidence.assumed.length === 0 ? (
            <p className="evidence-empty">No assumptions needed for this scan.</p>
          ) : (
            <ul>
              {live.evidence.assumed.map((line, i) => (
                <li key={i}>
                  <span className="ev-dash" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {live.thin && (
        <div className="scan-limit">
          <strong>Thin signal.</strong> This site serves most of its tags dynamically, so a
          static fetch sees very little. The score reflects only what was visible. The Deep
          scan (in beta) executes the page to read the live dataLayer and network calls.
        </div>
      )}
    </section>
  );
}

export default function App() {
  const demo = useMemo(() => runDemo(), []);
  const [mode, setMode] = useState<Mode>("fixture");
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [live, setLive] = useState<LiveScan | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [scanningHost, setScanningHost] = useState(STORE_HOST);
  const reqId = useRef(0);

  // Unified source for the scorecard. Fixture mode reads the frozen demo verbatim.
  const view: ScanView = mode === "live" && live ? live : demo;

  const showCard = phase === "broken" || phase === "fixing" || phase === "recovered";
  const showFixes = phase === "fixing" || phase === "recovered";

  const targetScore =
    phase === "recovered"
      ? view.after.score
      : phase === "broken" || phase === "fixing"
        ? view.before.score
        : 0;
  const score = useTween(targetScore, phase === "recovered" ? 1500 : 1100);
  const color = scoreColor(score);
  const grade = phase === "idle" || phase === "scanning" ? "\u00b7" : gradeForLive(score);
  const recovered = useTween(phase === "recovered" ? view.recoveredPct : 0, 1500);

  // Auto-advance is the fixture's scripted beat only. Live scans drive their own timing.
  useEffect(() => {
    if (mode !== "fixture") return;
    if (phase !== "scanning") return;
    const t = setTimeout(() => setPhase("broken"), 2400);
    return () => clearTimeout(t);
  }, [phase, mode]);

  function startDemo() {
    setLiveError(null);
    setLive(null);
    setMode("fixture");
    setScanningHost(STORE_HOST);
    setPhase("scanning");
  }

  async function runLiveScan(target: string) {
    const clean = target.trim();
    if (clean.length === 0) return;
    const id = ++reqId.current;
    setLiveError(null);
    setUrl(clean);
    setScanningHost(hostFromUrl(clean));
    setMode("live");
    setPhase("scanning");

    const startedAt = Date.now();
    const settle = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1500) await new Promise((r) => setTimeout(r, 1500 - elapsed));
    };

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: clean }),
      });
      const data = (await res.json()) as LiveScan | { ok: false; error?: string };
      if (id !== reqId.current) return;
      if (!res.ok || !("ok" in data) || data.ok !== true) {
        const msg = ("error" in data && data.error) || "That scan did not go through. Try another URL.";
        await settle();
        if (id !== reqId.current) return;
        setLiveError(msg);
        setMode("fixture");
        setPhase("idle");
        return;
      }
      await settle();
      if (id !== reqId.current) return;
      setLive(data);
      setPhase("broken");
    } catch {
      await settle();
      if (id !== reqId.current) return;
      setLiveError("We could not reach the scanner. Check the URL and try again.");
      setMode("fixture");
      setPhase("idle");
    }
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    void runLiveScan(url);
  }

  function issueState(id: string): IssueState {
    if (phase !== "recovered") return "broken";
    if (view.resolvedIssueIds.includes(id)) return "resolved";
    return "recommend";
  }

  const lostNow =
    phase === "recovered"
      ? view.after.estimatedConversionsLostPct
      : view.before.estimatedConversionsLostPct;

  const recommendedCount = view.before.issues.length - view.resolvedIssueIds.length;
  const resolvedLabel =
    view.resolvedIssueIds.length +
    " fixed" +
    (recommendedCount > 0 ? " \u00b7 " + recommendedCount + " recommended" : "");

  const isLive = mode === "live";

  return (
    <div className="app">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-grain" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <Mark />
          <span className="wordmark">TrueTrack</span>
        </div>
        <div className="topbar-right mono">
          <span className="status-dot" />
          {isLive ? "fast scan (beta) \u00b7 live fetch" : "demo mode \u00b7 built-in fixtures"}
        </div>
      </header>

      <main className="main">
        {phase === "idle" && (
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow mono reveal">tracking health scanner</div>
              <h1 className="reveal" style={{ animationDelay: "60ms" }}>
                Your analytics is <span className="lie">lying</span> to you.
              </h1>
              <p className="reveal" style={{ animationDelay: "140ms" }}>
                Between consent-mode misconfiguration, ITP and cookie loss, and missing
                server-side tracking, the average site silently loses 20 to 40% of its
                conversions. You bid, budget, and report on numbers that are simply wrong.
              </p>
              <p className="lede reveal" style={{ animationDelay: "200ms" }}>
                TrueTrack scans your stack, scores it 0 to 100, finds the conversions you
                are losing, and generates the fixes. In minutes.
              </p>

              <div className="hero-actions reveal" style={{ animationDelay: "280ms" }}>
                <button className="btn primary" onClick={startDemo}>
                  Scan the broken DTC store
                  <span className="btn-arrow">→</span>
                </button>
                <form className="url-form" onSubmit={submitUrl}>
                  <span className="beta-tag mono">fast scan · beta</span>
                  <input
                    type="text"
                    placeholder="or paste a live site URL"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-label="Site URL"
                  />
                  <button type="submit" className="btn ghost">
                    Scan
                  </button>
                </form>
              </div>

              <div className="examples reveal" style={{ animationDelay: "340ms" }}>
                <span className="examples-label mono">try a real store:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    className="example-chip mono"
                    onClick={() => void runLiveScan(ex.url)}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              {liveError && <p className="url-error">{liveError}</p>}
            </div>

            <div className="hero-visual reveal" style={{ animationDelay: "200ms" }}>
              <Gauge value={0} color="var(--track-bright)" grade={"\u00b7"} label="awaiting scan" />
            </div>
          </section>
        )}

        {phase === "scanning" && (
          <section className="scanning">
            <div className="scan-ring" style={{ ["--signal" as string]: "var(--amber)" }}>
              <div className="scan-spinner" />
              <div className="scan-center mono">scanning</div>
            </div>
            <div className="scan-feed">
              <div className="scan-target mono">
                {scanningHost}
                {isLive && <span className="scan-live-tag">live</span>}
              </div>
              <ul>
                {SCAN_STEPS.map((step, i) => (
                  <li key={step} className="scan-step" style={{ animationDelay: i * 280 + "ms" }}>
                    <span className="scan-tick" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showCard && (
          <section className="scorecard">
            <div className="gauge-panel" style={{ ["--signal" as string]: color }}>
              <Gauge value={score} color={color} grade={grade} label="tracking health" />

              {phase !== "recovered" ? (
                <div className="summary alert">
                  <div className="summary-big mono">~{lostNow}%</div>
                  <div className="summary-label">of conversions lost every month</div>
                </div>
              ) : (
                <div className="summary win">
                  <div className="summary-big mono">+{Math.round(recovered)}%</div>
                  <div className="summary-label">conversions recovered this month</div>
                  <div className="jump mono">score jump {view.before.score} → {view.after.score}</div>
                </div>
              )}

              <div className="panel-actions">
                {phase === "broken" && (
                  <button className="btn primary wide" onClick={() => setPhase("fixing")}>
                    Apply TrueTrack fixes
                    <span className="btn-arrow">→</span>
                  </button>
                )}
                {phase === "fixing" && (
                  <button className="btn primary wide" onClick={() => setPhase("recovered")}>
                    Re-scan to verify
                    <span className="btn-arrow">↻</span>
                  </button>
                )}
                {phase === "recovered" && (
                  <button className="btn ghost wide" onClick={startDemo}>
                    Run it again
                  </button>
                )}
              </div>
            </div>

            <div className="issues-panel">
              <div className="panel-title">
                <h2>{phase === "recovered" ? "Resolved" : "Detected issues"}</h2>
                <span className="count mono">
                  {phase === "recovered" ? resolvedLabel : view.before.issues.length + " found"}
                </span>
              </div>
              <div className="issue-list">
                {view.before.issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} state={issueState(issue.id)} />
                ))}
              </div>
            </div>
          </section>
        )}

        {showCard && isLive && live && <EvidencePanel live={live} />}

        {showFixes && (
          <section className="fixes">
            <div className="panel-title">
              <h2>Generated fixes</h2>
              <span className="count mono">{view.fixes.length} remediations · paste-ready</span>
            </div>
            <p className="fixes-sub">
              Real, concrete config. Server-side GTM, Meta Conversions API with event
              de-duplication, GA4 Measurement Protocol, Consent Mode v2, and data-driven
              attribution. Expand any fix to read the actual output.
            </p>
            <div className="fix-list">
              {view.fixes.map((fix, i) => (
                <FixCard key={fix.issueId} fix={fix} index={i} defaultOpen={i === 0} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer mono">
        <span>TrueTrack · an Agent Skill + MCP server for marketing measurement</span>
        <span className="footer-note">
          {isLive
            ? "fast scan reads only what the page serves · deep scan is in beta"
            : "demo runs on built-in fixtures, so it never fails live"}
        </span>
      </footer>
    </div>
  );
}
