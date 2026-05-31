# Fixtures

Two twins used by the demo and tests:

- `broken-store/stack.json` - a deliberately broken setup. Fails every check and
  scores **41/100** with ~34% of conversions estimated lost.
- `fixed-store/stack.json` - the corrected twin. Passes the major checks and
  scores **94/100**; the remaining 6 points are Enhanced Conversions, surfaced as
  the recommended next optimization.

These shapes match the live `StackSnapshot` the Phase 1 scanner will produce, so
scoring and fixing behave identically for fixtures and real sites.
