import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";

export function registerObserveTools(server: McpServer): void {
  server.registerTool(
    "console_messages",
    {
      title: "Console Messages",
      description:
        "Get captured browser console messages (log, warn, error) since the tab was attached.",
      inputSchema: z.object({
        level: z
          .enum(["all", "error", "warn"])
          .optional()
          .describe(
            "Filter by level: 'all' (default), 'error' (errors only), 'warn' (warnings + errors)"
          ),
        clear: z
          .boolean()
          .optional()
          .describe("Clear messages after reading (default: false)"),
      }),
    },
    async ({ level, clear }) => {
      try {
        await connectionManager.verifyTab();
        let messages = connectionManager.getConsoleMessages();

        const filterLevel = level ?? "all";
        if (filterLevel === "error") {
          messages = messages.filter((m) => m.level === "error");
        } else if (filterLevel === "warn") {
          messages = messages.filter(
            (m) => m.level === "error" || m.level === "warning"
          );
        }

        if (clear) {
          connectionManager.clearConsoleMessages();
        }

        if (messages.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No console messages captured." },
            ],
          };
        }

        const text = messages
          .map((m) => `[${m.level}] ${m.text}`)
          .join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "network_requests",
    {
      title: "Network Requests",
      description:
        "Get captured network requests since the tab was attached.",
      inputSchema: z.object({
        urlPattern: z
          .string()
          .optional()
          .describe("Filter requests by URL substring"),
        clear: z
          .boolean()
          .optional()
          .describe("Clear requests after reading (default: false)"),
      }),
    },
    async ({ urlPattern, clear }) => {
      try {
        await connectionManager.verifyTab();
        let requests = connectionManager.getNetworkRequests();

        if (urlPattern) {
          requests = requests.filter((r) => r.url.includes(urlPattern));
        }

        if (clear) {
          connectionManager.clearNetworkRequests();
        }

        if (requests.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No network requests captured.",
              },
            ],
          };
        }

        const text = requests
          .map(
            (r) =>
              `${r.method} ${r.status ?? "..."} ${r.url}${r.size != null ? ` (${r.size}B)` : ""}`
          )
          .join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );
}
