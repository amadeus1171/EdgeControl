import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import {
  captureScreenshot,
  evaluate,
  getAccessibilityTree,
} from "../cdp/wrapper.js";

export function registerPageTools(server: McpServer): void {
  server.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description:
        "Take a screenshot of the current viewport. Returns a base64 PNG image.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const data = await captureScreenshot();
        return {
          content: [
            { type: "image" as const, data, mimeType: "image/png" },
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
    "get_page_text",
    {
      title: "Get Page Text",
      description:
        "Extract all visible text content from the current page.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const text = await evaluate("document.body.innerText");
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
    "get_dom",
    {
      title: "Get DOM",
      description:
        "Get an accessibility tree snapshot of the page. Shows element roles, names, and structure.",
      inputSchema: z.object({
        depth: z
          .number()
          .optional()
          .describe("Max tree depth to return (default: no limit)"),
      }),
    },
    async ({ depth }) => {
      try {
        await connectionManager.verifyTab();
        const tree = await getAccessibilityTree(depth);
        return {
          content: [{ type: "text" as const, text: tree || "Empty page." }],
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
    "evaluate_js",
    {
      title: "Evaluate JavaScript",
      description:
        "Execute JavaScript in the page context and return the result.",
      inputSchema: z.object({
        expression: z.string().describe("JavaScript expression to evaluate"),
      }),
    },
    async ({ expression }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(expression);
        return { content: [{ type: "text" as const, text: result }] };
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
