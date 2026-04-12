import { z } from "zod/v4";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import {
  captureScreenshot,
  evaluate,
  getAccessibilityTree,
  resolveSelector,
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

  server.registerTool(
    "full_page_screenshot",
    {
      title: "Full Page Screenshot",
      description:
        "Take a screenshot of the entire page (beyond the viewport). Returns a base64 PNG image.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const dimsJson = await evaluate(
          "JSON.stringify({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})"
        );
        const dims = JSON.parse(dimsJson);
        await (client as any).Emulation.setDeviceMetricsOverride({
          width: dims.w,
          height: dims.h,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const data = await captureScreenshot();
        await (client as any).Emulation.clearDeviceMetricsOverride();
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
    "print_to_pdf",
    {
      title: "Print to PDF",
      description:
        "Print the current page to a PDF file. Returns the file path of the saved PDF.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const { data } = await (client as any).Page.printToPDF({ printBackground: true });
        const filePath = path.join(os.tmpdir(), `edge-control-${Date.now()}.pdf`);
        fs.writeFileSync(filePath, Buffer.from(data, "base64"));
        return {
          content: [
            {
              type: "text" as const,
              text: `PDF saved to: ${filePath}`,
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

  server.registerTool(
    "get_html",
    {
      title: "Get HTML",
      description:
        "Get the HTML source of the page or a specific element.",
      inputSchema: z.object({
        selector: z
          .string()
          .optional()
          .describe(
            "CSS selector to get innerHTML of a specific element. If omitted, returns the full page outerHTML."
          ),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        let html: string;
        if (selector) {
          html = await evaluate(`
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (!el) return 'Element not found: ${selector.replace(/'/g, "\\'")}';
              return el.innerHTML;
            })()
          `);
        } else {
          html = await evaluate("document.documentElement.outerHTML");
        }
        return { content: [{ type: "text" as const, text: html }] };
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
    "wait_for_element",
    {
      title: "Wait for Element",
      description:
        "Wait for an element to appear or disappear from the page.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector to wait for"),
        visible: z
          .boolean()
          .optional()
          .describe(
            "true (default) = wait for element to appear; false = wait for element to disappear"
          ),
        timeout: z
          .number()
          .optional()
          .describe("Max wait time in milliseconds (default: 5000)"),
      }),
    },
    async ({ selector, visible, timeout }) => {
      try {
        await connectionManager.verifyTab();
        const waitForVisible = visible !== false;
        const maxWait = timeout ?? 5000;
        const pollInterval = 200;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const exists = await evaluate(
            `!!document.querySelector(${JSON.stringify(selector)})`
          );
          const found = exists === "true";
          if (waitForVisible && found) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Element found: ${selector} (after ${Date.now() - startTime}ms)`,
                },
              ],
            };
          }
          if (!waitForVisible && !found) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Element disappeared: ${selector} (after ${Date.now() - startTime}ms)`,
                },
              ],
            };
          }
          await new Promise((r) => setTimeout(r, pollInterval));
        }

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Timeout (${maxWait}ms): element ${selector} ${waitForVisible ? "did not appear" : "did not disappear"}`,
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

  server.registerTool(
    "get_element_info",
    {
      title: "Get Element Info",
      description:
        "Get detailed information about an element: tag, attributes, text, value, computed styles.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const _unused = await resolveSelector(selector);
        void _unused;
        const result = await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return JSON.stringify({ error: 'Element not found' });
            const attrs = {};
            for (const a of el.attributes) attrs[a.name] = a.value;
            const cs = window.getComputedStyle(el);
            const styles = {
              display: cs.display,
              visibility: cs.visibility,
              color: cs.color,
              backgroundColor: cs.backgroundColor,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              width: cs.width,
              height: cs.height,
              position: cs.position,
              opacity: cs.opacity,
            };
            return JSON.stringify({
              tagName: el.tagName.toLowerCase(),
              attributes: attrs,
              textContent: (el.textContent || '').substring(0, 500),
              value: el.value !== undefined ? el.value : null,
              checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : null,
              computedStyle: styles,
              boundingRect: el.getBoundingClientRect().toJSON(),
            }, null, 2);
          })()
        `);
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
