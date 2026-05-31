# TrueTrack web scorecard

Vite + React + TypeScript single-page app. It is the clickable demo at
truetrack.pages.dev and the surface community voters see.

The scoring engine under `src/engine` is a vendored copy of the canonical engine
in the repo's `/src` (the same code used by the CLI demo, the MCP server, and the
vitest suite). It is vendored so this app builds standalone, with no dependency on
the monorepo layout. The loop is deterministic on the bundled fixtures, so the
demo never fails live: scan -> 41, apply fixes -> 5 paste-ready configs, re-scan
-> 94, +34% conversions recovered.

## Develop
    npm install
    npm run dev

## Build
    npm install
    npm run build      # outputs to web/dist

## Deploy (Cloudflare Pages)
Build command: `npm install && npm run build`  |  Output directory: `dist`
If using the dashboard Git integration, set the root directory to `web`.
