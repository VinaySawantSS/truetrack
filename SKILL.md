# TrueTrack Agent Skill

**Name:** truetrack

**Description:** Scores a website's marketing measurement stack 0-100, finds the
conversions it is silently losing, generates the concrete tracking fixes, and
proves the recovery by re-scoring. Use it whenever someone asks why their GA4 /
Ads / Meta numbers look low, whether their tracking is set up correctly, how
much conversion data they are losing, or to audit and remediate a GTM / GA4 /
Meta Pixel / consent-mode / server-side setup.

## When to use

- "Why is my GA4 undercounting purchases?"
- "Audit our tracking / measurement setup."
- "Is our consent mode / server-side tagging configured correctly?"
- "How many conversions are we losing and how do we fix it?"

## Workflow

1. **scan_site** - detect the stack for a URL (or a built-in demo fixture) and
   return a `StackSnapshot`.
2. **score_site** - turn the snapshot into a 0-100 Tracking Health Score with a
   prioritized list of issues and the estimated conversions lost.
3. **generate_fixes** - produce concrete remediation for each issue: server-side
   GTM config, GA4 Measurement Protocol payloads, Meta Conversions API mappings.
4. **apply_fixes** - apply the fixes to the snapshot and re-score to prove the
   jump and the recovered conversions.

## Inputs and outputs

- Input: a site URL, or `{ fixture: "broken-store" | "fixed-store" }` for the demo.
- Output: `ScoreResult` (score, grade, ranked issues, estimated % lost) and, after
  fixing, a before/after pair plus the generated configuration snippets.

## Notes

- Deterministic and stack-agnostic: works on any GA4 / GTM / Meta setup.
- Model-portable: the remediation reasoning runs on Claude or Kimi.
