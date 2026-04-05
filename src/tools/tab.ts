import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";

export function registerTabTools(server: McpServer): void {
  server.registerTool(
    "list_tabs",
    {
      title: "List Tabs",
      description:
        "List all open tabs in the Edge debug instance. Returns tab ID, title, and URL for each.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const tabs = await connectionManager.listTabs();
        const currentId = connectionManager.getCurrentTabId();
        const text = tabs
          .map(
            (t) =>
              `${t.id === currentId ? "* " : "  "}${t.title}\n    ${t.url}\n    id: ${t.id}`
          )
          .join("\n\n");
        return {
          content: [
            { type: "text" as const, text: text || "No tabs open." },
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
    "get_active_tab",
    {
      title: "Get Active Tab",
      description:
        "Get info about the currently attached tab (title, URL, tab ID).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const verification = await connectionManager.verifyTab();
        const tabs = await connectionManager.listTabs();
        const currentId = connectionManager.getCurrentTabId();
        const tab = tabs.find((t) => t.id === currentId);
        let text = "";
        if (verification.reattached && verification.message) {
          text += verification.message + "\n\n";
        }
        if (tab) {
          text += `Title: ${tab.title}\nURL: ${tab.url}\nID: ${tab.id}`;
        } else {
          text += "No active tab.";
        }
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
    "activate_tab",
    {
      title: "Activate Tab",
      description:
        "Switch to a specific tab by its ID. Use list_tabs to find tab IDs.",
      inputSchema: z.object({
        tabId: z.string().describe("The tab ID to activate"),
      }),
    },
    async ({ tabId }) => {
      try {
        const tab = await connectionManager.activateTab(tabId);
        return {
          content: [
            {
              type: "text" as const,
              text: `Switched to: ${tab.title}\nURL: ${tab.url}\nID: ${tab.id}`,
            },
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
}
