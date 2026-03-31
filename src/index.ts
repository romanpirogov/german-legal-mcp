// ─────────────────────────────────────────────────────────────────────────────
// German Legal MCP Server — Main Entry Point
//
// Sources aggregated:
//   1. DIP Bundestag         search.dip.bundestag.de/api/v1       (requires API key)
//   2. NeuRIS (Beta)         testphase.rechtsinformationen.bund.de (public, no key)
//   3. Open Legal Data       de.openlegaldata.io/api               (public, optional key)
//   4. Gesetze im Internet   gesetze-im-internet.de                (public XML)
//   5. Rechtsprechung i.I.   rechtsprechung-im-internet.de         (public XML/RSS)
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerDipTools } from "./tools/dip.js";
import { registerNeurisTools } from "./tools/neuris.js";
import { registerOldpTools } from "./tools/oldp.js";
import { registerGiiTools } from "./tools/gii.js";

// ── Server creation ───────────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: "german-legal-mcp-server",
    version: "1.0.0",
  });

  registerDipTools(server);    // 7 tools — DIP Bundestag (laws in progress, plenary, persons)
  registerNeurisTools(server); // 4 tools — NeuRIS beta (federal statutes + federal courts)
  registerOldpTools(server);   // 5 tools — Open Legal Data (cases, laws, courts)
  registerGiiTools(server);    // 4 tools — Gesetze im Internet + RII portals directory

  return server;
}

// ── Transport: stdio ──────────────────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("German Legal MCP Server running on stdio\n");
}

// ── Transport: Streamable HTTP ────────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "german-legal-mcp-server",
      version: "1.0.0",
      tools: 20,
      sources: [
        "DIP Bundestag (search.dip.bundestag.de/api/v1)",
        "NeuRIS Beta (testphase.rechtsinformationen.bund.de)",
        "Open Legal Data (de.openlegaldata.io/api)",
        "Gesetze im Internet (gesetze-im-internet.de)",
        "Rechtsprechung im Internet (rechtsprechung-im-internet.de)",
      ],
    });
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    process.stderr.write(`German Legal MCP Server running on http://localhost:${port}/mcp\n`);
    process.stderr.write(`Health check: http://localhost:${port}/health\n`);
  });
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
  runHTTP().catch((err: unknown) => {
    process.stderr.write(`Server error: ${String(err)}\n`);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    process.stderr.write(`Server error: ${String(err)}\n`);
    process.exit(1);
  });
}
