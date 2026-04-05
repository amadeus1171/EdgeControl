import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";

export function registerNavigateTools(server: McpServer): void {
  server.registerTool(
    "navigate",
    {
      title: "Navigate",
      description: "Navigate to a URL in the current tab.",
      inputSchema: z.object({
        url: z.string().describe("The URL to navigate to"),
      }),
    },
    async ({ url }) => {
      try {
        const client = await connectionManager.ensureConnected();
        const { Page } = client;
        await Page.navigate({ url });
        await Page.loadEventFired();
        return {
          content: [
            { type: "text" as const, text: `Navigated to: ${url}` },
          ],
        };
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
    "go_back",
    {
      title: "Go Back",
      description: "Navigate back in browser history.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const client = await connectionManager.ensureConnected();
        const { Page } = client;
        const { currentIndex, entries } =
          await Page.getNavigationHistory();
        if (currentIndex > 0) {
          await Page.navigateToHistoryEntry({
            entryId: entries[currentIndex - 1].id,
          });
          await Page.loadEventFired();
          return {
            content: [
              {
                type: "text" as const,
                text: `Went back to: ${entries[currentIndex - 1].url}`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: "Already at the beginning of history." },
          ],
        };
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
    "go_forward",
    {
      title: "Go Forward",
      description: "Navigate forward in browser history.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const client = await connectionManager.ensureConnected();
        const { Page } = client;
        const { currentIndex, entries } =
          await Page.getNavigationHistory();
        if (currentIndex < entries.length - 1) {
          await Page.navigateToHistoryEntry({
            entryId: entries[currentIndex + 1].id,
          });
          await Page.loadEventFired();
          return {
            content: [
              {
                type: "text" as const,
                text: `Went forward to: ${entries[currentIndex + 1].url}`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: "Already at the end of history." },
          ],
        };
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
    "reload",
    {
      title: "Reload",
      description: "Reload the current page.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const client = await connectionManager.ensureConnected();
        const { Page } = client;
        await Page.reload();
        await Page.loadEventFired();
        return {
          content: [{ type: "text" as const, text: "Page reloaded." }],
        };
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
