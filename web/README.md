# web (Phase 3)

Next.js + React scorecard UI lives here: URL / "scan a demo store" input, an
animated 0-100 gauge, the prioritized issue list, an "Apply TrueTrack fixes"
action that reveals the generated config, the before/after score, and a
"conversions recovered" counter.

It calls the same `scanner` / `scoring` / `fixer` functions used by the CLI demo
and the MCP server, so the score-jump logic is shared, not reimplemented.
