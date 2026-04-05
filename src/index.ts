#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTabTools } from "./tools/tab.js";
import { registerPageTools } from "./tools/page.js";
import { registerInteractTools } from "./tools/interact.js";
import { registerNavigateTools } from "./tools/navigate.js";
import { registerObserveTools } from "./tools/observe.js";

const server = new McpServer(
  { name: "edge-control", version: "0.1.0" },
  { capabilities: { logging: {} } }
);

registerTabTools(server);
registerPageTools(server);
registerInteractTools(server);
registerNavigateTools(server);
registerObserveTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

export { server };
