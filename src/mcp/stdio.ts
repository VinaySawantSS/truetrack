#!/usr/bin/env node
/**
 * TrueTrack MCP server, stdio transport.
 *
 * Binds the four TrueTrack handlers (scan_site, score_site, generate_fixes,
 * apply_fixes) to a stdio MCP transport so the server runs as a local process
 * that any MCP client (Claude Desktop, Claude Code, etc.) can spawn.
 *
 * Run it directly with:   npm run mcp
 * Or wire it into an MCP client config with:
 *   command: "npx", args: ["-y", "tsx", "src/mcp/stdio.ts"], cwd: "<repo root>"
 *
 * Note: stdout is the JSON-RPC channel. Never console.log here. Logs go to
 * stderr only.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  handleScanSite,
  handleScoreSite,
  handleGenerateFixes,
  handleApplyFixes,
} from "./server.js";

const SEVERITY = ["critical", "high", "medium", "low"] as const;

const snapshotSchema = {
  type: "object",
  description: "Normalized measurement-stack snapshot, exactly as returned by scan_site.",
  properties: {
    url: { type: "string" },
    gtm: {
      type: "object",
      properties: {
        webContainer: { type: "boolean" },
        serverContainer: { type: "boolean" },
        containerId: { type: "string" },
      },
      required: ["webContainer", "serverContainer"],
    },
    ga4: {
      type: "object",
      properties: {
        installed: { type: "boolean" },
        viaServerSide: { type: "boolean" },
        measurementProtocol: { type: "boolean" },
        measurementId: { type: "string" },
      },
      required: ["installed", "viaServerSide", "measurementProtocol"],
    },
    metaPixel: {
      type: "object",
      properties: {
        installed: { type: "boolean" },
        capi: { type: "boolean" },
        serverEvents: { type: "boolean" },
        pixelId: { type: "string" },
      },
      required: ["installed", "capi", "serverEvents"],
    },
    consentMode: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        defaultDenied: { type: "boolean" },
        blocksTagsWhenUnknown: { type: "boolean" },
      },
      required: ["present", "defaultDenied", "blocksTagsWhenUnknown"],
    },
    attribution: {
      type: "object",
      properties: {
        model: {
          type: "string",
          enum: ["last-click", "data-driven", "position-based", "unknown"],
        },
      },
      required: ["model"],
    },
    enhancedConversions: { type: "boolean" },
  },
  required: ["url", "gtm", "ga4", "metaPixel", "consentMode", "attribution", "enhancedConversions"],
} as const;

const issueSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    severity: { type: "string", enum: SEVERITY },
    weight: { type: "number" },
    conversionsLostPct: { type: "number" },
    detail: { type: "string" },
  },
  required: ["id", "title", "severity", "weight", "conversionsLostPct", "detail"],
} as const;

const fixSchema = {
  type: "object",
  description: "A remediation object, exactly as returned by generate_fixes.",
  properties: {
    issueId: { type: "string" },
    type: { type: "string" },
    title: { type: "string" },
    config: { type: "string" },
  },
  required: ["issueId", "type", "title", "config"],
} as const;

const TOOLS = [
  {
    name: "scan_site",
    description:
      "Detect the measurement stack for a demo fixture (or a URL). Returns a normalized StackSnapshot. Live URL scanning is not yet implemented, so pass a fixture for the demo loop.",
    inputSchema: {
      type: "object",
      properties: {
        fixture: {
          type: "string",
          enum: ["broken-store", "fixed-store"],
          description: "Built-in demo fixture to scan.",
        },
        url: {
          type: "string",
          description: "Live site URL (not yet implemented; will throw).",
        },
      },
    },
  },
  {
    name: "score_site",
    description:
      "Return a 0-100 Tracking Health Score, letter grade, prioritized issues, and estimated conversions lost for a snapshot.",
    inputSchema: {
      type: "object",
      properties: { snapshot: snapshotSchema },
      required: ["snapshot"],
    },
  },
  {
    name: "generate_fixes",
    description:
      "Generate concrete, paste-ready remediation (sGTM config, GA4 Measurement Protocol payloads, Meta CAPI mappings) for a list of issues.",
    inputSchema: {
      type: "object",
      properties: { issues: { type: "array", items: issueSchema } },
      required: ["issues"],
    },
  },
  {
    name: "apply_fixes",
    description:
      "Apply fixes to a snapshot and re-score, returning before and after results to prove the recovery.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot: snapshotSchema,
        fixes: { type: "array", items: fixSchema },
      },
      required: ["snapshot", "fixes"],
    },
  },
] as const;

const server = new Server(
  { name: "truetrack", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    switch (name) {
      case "scan_site":
        result = await handleScanSite(args as Parameters<typeof handleScanSite>[0]);
        break;
      case "score_site":
        result = handleScoreSite(args as Parameters<typeof handleScoreSite>[0]);
        break;
      case "generate_fixes":
        result = handleGenerateFixes(args as Parameters<typeof handleGenerateFixes>[0]);
        break;
      case "apply_fixes":
        result = handleApplyFixes(args as Parameters<typeof handleApplyFixes>[0]);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TrueTrack MCP server running on stdio. Tools: scan_site, score_site, generate_fixes, apply_fixes.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
