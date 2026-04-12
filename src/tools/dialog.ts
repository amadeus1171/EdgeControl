import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";

export function registerDialogTools(server: McpServer): void {
  server.registerTool(
    "get_pending_dialog",
    {
      title: "Get Pending Dialog",
      description:
        "Check if there is a pending JavaScript dialog (alert/confirm/prompt). Returns dialog type and message.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const dialog = connectionManager.getPendingDialog();
        if (!dialog) {
          return {
            content: [{ type: "text" as const, text: "No pending dialog." }],
          };
        }
        let text = `Dialog type: ${dialog.type}\nMessage: ${dialog.message}`;
        if (dialog.defaultPrompt !== undefined) {
          text += `\nDefault prompt value: ${dialog.defaultPrompt}`;
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    }
  );

  server.registerTool(
    "handle_dialog",
    {
      title: "Handle Dialog",
      description:
        "Accept or dismiss a pending JavaScript dialog (alert/confirm/prompt).",
      inputSchema: z.object({
        accept: z.boolean().describe("true to accept (OK), false to dismiss (Cancel)"),
        promptText: z
          .string()
          .optional()
          .describe("Text to enter for prompt dialogs"),
      }),
    },
    async ({ accept, promptText }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const params: any = { accept };
        if (promptText !== undefined) {
          params.promptText = promptText;
        }
        await client.Page.handleJavaScriptDialog(params);
        connectionManager.clearPendingDialog();
        return {
          content: [
            {
              type: "text" as const,
              text: `Dialog ${accept ? "accepted" : "dismissed"}${promptText ? ` with text: ${promptText}` : ""}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
          ],
        };
      }
    }
  );
}
