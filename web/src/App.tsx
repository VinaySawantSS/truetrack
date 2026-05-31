import { useEffect, useMemo, useState } from "react";
import { Gauge } from "./Gauge";
import { useTween } from "./useTween";
import { scoreColor, gradeForLive } from "./util";
import {
  runDemo,
  SCAN_STEPS,
  STORE_HOST,
  type Issue,
  type Fix,
} from "./engine";

type Phase = "idle" | "scanning" | "broken" | "fixing" | "recovered";
type IssueState = "broken" | "resolved" | "recommend";

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

export default function App() {
  const demo = useMemo(() => runDemo(), []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [urlNote, setUrlNote] = useState(false);
  const [url, setUrl] = useState("");

  const showCard = phase === "broken" || phase === "fixing" || phase === "recovered";
  const showFixes = phase === "fixing" || phase === "recovered";

  const targetScore =
    phase === "recovered"
      ? demo.after.score
      : phase === "broken" || phase === "fixing"
        ? demo.before.score
        : 0;
  const score = useTween(targetScore, phase === "recovered" ? 1500 : 1100);
  const color = scoreColor(score);
  const grade = phase === "idle" || phase === "scanning" ? "·" : gradeForLive(score);
  const recovered = useTween(phase === "recovered" ? demo.recoveredPct : 0, 1500);

  useEffect(() => {
    if (phase !== "scanning") return;
    const t = setTimeout(() => setPhase("broken"), 2400);
    return () => clearTimeout(t);
  }, [phase]);

  function startDemo() {
    setUrlNote(false);
    setPhase("scanning");
  }
  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim().length === 0) return;
    setUrlNote(true);
  }

  function issueState(id: string): IssueState {
    if (phase !== "recovered") return "broken";
    if (demo.resolvedIssueIds.includes(id)) return "resolved";
    return "recommend";
  }

  const lostNow = phase === "recovered" ? demo.after.estimatedConversionsLostPct : demo.before.estimatedConversionsLostPct;

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
          demo mode · built-in fixtures
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
                  <input
                    type="text"
                    placeholder="or paste a site URL"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-label="Site URL"
                  />
                  <button type="submit" className="btn ghost">
                    Scan
                  </button>
                </form>
              </div>
              {urlNote && (
                <p className="url-note">
                  Live scanning of arbitrary URLs is coming soon. For this demo, scan the
                  broken DTC store above to see the full loop.
                </p>
              )}
            </div>

            <div className="hero-visual reveal" style={{ animationDelay: "200ms" }}>
              <Gauge value={0} color="var(--track-bright)" grade="·" label="awaiting scan" />
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
              <div className="scan-target mono">{STORE_HOST}</div>
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
                  <div className="jump mono">score jump {demo.before.score} → {demo.after.score}</div>
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
                  <button className="btn ghost wide" onClick={() => setPhase("idle")}>
                    Run it again
                  </button>
                )}
              </div>
            </div>

            <div className="issues-panel">
              <div className="panel-title">
                <h2>{phase === "recovered" ? "Resolved" : "Detected issues"}</h2>
                <span className="count mono">
                  {phase === "recovered"
                    ? demo.resolvedIssueIds.length + " fixed · 1 recommended"
                    : demo.before.issues.length + " found"}
                </span>
              </div>
              <div className="issue-list">
                {demo.before.issues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} state={issueState(issue.id)} />
                ))}
              </div>
            </div>
          </section>
        )}

        {showFixes && (
          <section className="fixes">
            <div className="panel-title">
              <h2>Generated fixes</h2>
              <span className="count mono">{demo.fixes.length} remediations · paste-ready</span>
            </div>
            <p className="fixes-sub">
              Real, concrete config. Server-side GTM, Meta Conversions API with event
              de-duplication, GA4 Measurement Protocol, Consent Mode v2, and data-driven
              attribution. Expand any fix to read the actual output.
            </p>
            <div className="fix-list">
              {demo.fixes.map((fix, i) => (
                <FixCard key={fix.issueId} fix={fix} index={i} defaultOpen={i === 0} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer mono">
        <span>TrueTrack · an Agent Skill + MCP server for marketing measurement</span>
        <span className="footer-note">demo runs on built-in fixtures, so it never fails live</span>
      </footer>
    </div>
  );
}
