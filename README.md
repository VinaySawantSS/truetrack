# TrueTrack

![CI](https://github.com/VinaySawantSS/truetrack/actions/workflows/ci.yml/badge.svg)

**Your analytics is losing 20-40% of your conversions. TrueTrack finds them and fixes the tracking automatically.**

Every business running ads is optimizing on a lie. Between consent-mode
misconfiguration, browser privacy (ITP and cookie loss), and missing
server-side tracking, the average site silently loses 20-40% of its conversion
data. Teams then bid, budget, and report on numbers that are simply wrong.

TrueTrack is an autonomous AI agent that does three things:

1. **SCANS** the full measurement stack (GTM, GA4, Meta Pixel, consent mode,
   server-side endpoints) and returns a 0-100 Tracking Health Score with a
   prioritized list of exactly what is broken and what it is costing.
2. **FIXES** it autonomously, generating concrete remediation: server-side GTM
   configuration, GA4 Measurement Protocol payloads, and Meta Conversions API
   event mappings.
3. **PROVES** it by re-scanning to show the score jump and the conversions it
   recovered.

It ships as an open Agent Skill (`SKILL.md`) plus an MCP server, so it drops
into any agentic workflow and is model-portable and stack-agnostic.

## Quickstart

```bash
npm install
npm run demo      # runs the scan -> score -> fix -> re-score loop on fixtures
npm test          # vitest: scanner, scoring, fixer
npm run typecheck # tsc, no emit
```

`npm run demo` prints the live score jump on the built-in demo store:

```
Broken store: score 41/100 (grade F)
  ... prioritized red issues with estimated conversions lost ...
Generated 5 fixes ...
After TrueTrack fixes: score 94/100 (grade A)
Score jump: 41 -> 94
Conversions recovered this month: +34%
```

## Architecture

```
src/
  types.ts        shared StackSnapshot / Issue / ScoreResult contracts
  scanner/        stack detection (fixtures now; live page probe in Phase 1)
  scoring/        weighted checks -> 0-100 score + prioritized issues
  fixer/          issue -> remediation (sGTM, GA4 MP, Meta CAPI) + apply loop
  mcp/            MCP tools: scan_site, score_site, generate_fixes, apply_fixes
  demo.ts         end-to-end CLI proof of the score-jump loop
fixtures/
  broken-store/   deliberately broken tag setup (scores 41)
  fixed-store/    the corrected twin (scores 94)
web/              Next.js scorecard UI (Phase 3)
tests/            vitest specs pinned to the demo contract
```

Flow: `scanner` produces a `StackSnapshot`, `scoring` turns it into a
`ScoreResult`, `fixer` maps the issues to remediation and can `applyFixes` to
return a corrected snapshot for the re-scan. The MCP layer exposes each step as
a tool; the same functions back the CLI demo and (Phase 3) the web UI.

## Scoring

The score starts at 100. Each check models a known conversion-loss failure mode
and removes weighted points when it fails; issues are returned sorted by impact
with an estimated share of conversions lost. Grades: A 90+, B 80+, C 70+,
D 50+, F below 50. The demo fixtures are pinned to 41 (broken) and 94 (fixed) so
the score-jump narrative is reproducible; weights are calibrated against real
client benchmarks and expanded in Phase 1.

## Agent Skill + MCP

- `SKILL.md` defines the agent skill: when to use it and the scan/score/fix/prove
  workflow.
- `src/mcp/server.ts` exposes `scan_site`, `score_site`, `generate_fixes`, and
  `apply_fixes`. The transport is bound to Cloudflare Workers in Phase 4.

## Tech stack

TypeScript, Cloudflare Workers (MCP server and scan/fix API), Next.js + React
(scorecard UI), Cloudflare Pages (hosting), GA4 Measurement Protocol,
server-side Google Tag Manager, Meta Conversions API, Claude or Kimi
(remediation reasoning), GitHub Actions (CI and tests).

## Status

- [x] Scaffold, typed contracts, fixtures, scoring spine, green CI
- [ ] Phase 1: expand the check set and live page scanner
- [ ] Phase 3: web scorecard UI (animated gauge, recovered counter)
- [ ] Phase 4: MCP transport on Cloudflare Workers, package + polish

## Team

Vinay Sawant (lead) and Ketaki Shinde. Built for the UCWS Singapore Hackathon 2026.

## License

MIT. See [LICENSE](./LICENSE).
