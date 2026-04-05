import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import {
  resolveSelector,
  getBoxModel,
  dispatchClick,
  dispatchHover,
  dispatchKeys,
  dispatchEnter,
  focusElement,
  scrollIntoView,
  dispatchScroll,
  evaluate,
} from "../cdp/wrapper.js";

export function registerInteractTools(server: McpServer): void {
  server.registerTool(
    "click",
    {
      title: "Click",
      description:
        "Click an element by CSS selector. Scrolls it into view first.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to click"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchClick(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Clicked: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
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
    "type",
    {
      title: "Type",
      description:
        "Type text into a focused element. Optionally specify a selector to focus first.",
      inputSchema: z.object({
        selector: z
          .string()
          .describe("CSS selector of the element to type into"),
        text: z.string().describe("Text to type"),
        submit: z
          .boolean()
          .optional()
          .describe("Press Enter after typing (default: false)"),
      }),
    },
    async ({ selector, text, submit }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        await focusElement(nodeId);
        await dispatchKeys(text);
        if (submit) {
          await dispatchEnter();
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Typed "${text}" into ${selector}${submit ? " and submitted" : ""}`,
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
    "scroll",
    {
      title: "Scroll",
      description: "Scroll the page or a specific element.",
      inputSchema: z.object({
        direction: z
          .enum(["up", "down", "left", "right"])
          .describe("Scroll direction"),
        amount: z
          .number()
          .optional()
          .describe("Scroll amount in pixels (default: 300)"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector of element to scroll. If omitted, scrolls the viewport."),
      }),
    },
    async ({ direction, amount, selector }) => {
      try {
        await connectionManager.verifyTab();
        const pixels = amount ?? 300;
        let x = 400;
        let y = 400;

        if (selector) {
          const nodeId = await resolveSelector(selector);
          const box = await getBoxModel(nodeId);
          x = box.x;
          y = box.y;
        }

        let deltaX = 0;
        let deltaY = 0;
        switch (direction) {
          case "up":
            deltaY = -pixels;
            break;
          case "down":
            deltaY = pixels;
            break;
          case "left":
            deltaX = -pixels;
            break;
          case "right":
            deltaX = pixels;
            break;
        }

        await dispatchScroll(x, y, deltaX, deltaY);
        return {
          content: [
            {
              type: "text" as const,
              text: `Scrolled ${direction} ${pixels}px${selector ? ` on ${selector}` : ""}`,
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
    "hover",
    {
      title: "Hover",
      description:
        "Hover over an element by CSS selector. Useful for tooltips and dropdowns.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to hover"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchHover(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Hovering over: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
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
    "select_option",
    {
      title: "Select Option",
      description: "Select a value in a <select> dropdown element.",
      inputSchema: z.object({
        selector: z
          .string()
          .describe("CSS selector of the <select> element"),
        value: z.string().describe("Value or visible text of the option to select"),
      }),
    },
    async ({ selector, value }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(`
          (() => {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el || el.tagName !== 'SELECT') return 'Element not found or not a <select>';
            const options = Array.from(el.options);
            const option = options.find(o => o.value === '${value.replace(/'/g, "\\'")}')
              || options.find(o => o.textContent?.trim() === '${value.replace(/'/g, "\\'")}');
            if (!option) return 'Option not found: ${value.replace(/'/g, "\\'")}';
            el.value = option.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Selected: ' + option.textContent?.trim();
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
