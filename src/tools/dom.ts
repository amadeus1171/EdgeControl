import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import { evaluate } from "../cdp/wrapper.js";

export function registerDomTools(server: McpServer): void {
  server.registerTool(
    "get_element_attribute",
    {
      title: "Get Element Attribute",
      description: "Get the value of an attribute on an element.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
        attribute: z.string().describe("Attribute name to read"),
      }),
    },
    async ({ selector, attribute }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return 'Element not found: ' + ${JSON.stringify(selector)};
            const val = el.getAttribute(${JSON.stringify(attribute)});
            return val === null ? 'Attribute not found: ' + ${JSON.stringify(attribute)} : val;
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
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
    "set_element_attribute",
    {
      title: "Set Element Attribute",
      description: "Set the value of an attribute on an element.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
        attribute: z.string().describe("Attribute name to set"),
        value: z.string().describe("Attribute value"),
      }),
    },
    async ({ selector, attribute, value }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
            el.setAttribute(${JSON.stringify(attribute)}, ${JSON.stringify(value)});
          })()
        `);
        return {
          content: [
            {
              type: "text" as const,
              text: `Set ${attribute}="${value}" on ${selector}`,
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

  server.registerTool(
    "remove_element_attribute",
    {
      title: "Remove Element Attribute",
      description: "Remove an attribute from an element.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
        attribute: z.string().describe("Attribute name to remove"),
      }),
    },
    async ({ selector, attribute }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('Element not found: ' + ${JSON.stringify(selector)});
            el.removeAttribute(${JSON.stringify(attribute)});
          })()
        `);
        return {
          content: [
            {
              type: "text" as const,
              text: `Removed ${attribute} from ${selector}`,
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

  server.registerTool(
    "get_computed_style",
    {
      title: "Get Computed Style",
      description:
        "Get computed CSS styles of an element. Optionally specify which properties to return.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
        properties: z
          .array(z.string())
          .optional()
          .describe(
            'CSS property names to get (e.g. ["color", "font-size"]). If omitted, returns 20 common properties.'
          ),
      }),
    },
    async ({ selector, properties }) => {
      try {
        await connectionManager.verifyTab();
        const defaultProps = JSON.stringify([
          "display",
          "visibility",
          "opacity",
          "color",
          "background-color",
          "font-size",
          "font-weight",
          "font-family",
          "line-height",
          "text-align",
          "width",
          "height",
          "margin",
          "padding",
          "border",
          "position",
          "top",
          "left",
          "z-index",
          "overflow",
        ]);
        const propsArg = properties ? JSON.stringify(properties) : defaultProps;
        const result = await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return JSON.stringify({ error: 'Element not found' });
            const cs = window.getComputedStyle(el);
            const props = ${propsArg};
            const result = {};
            for (const p of props) result[p] = cs.getPropertyValue(p);
            return JSON.stringify(result, null, 2);
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
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
    "query_elements",
    {
      title: "Query Elements",
      description:
        "Query all elements matching a CSS selector. Returns tag, text, attributes, and value for each (max 50).",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector"),
        attributes: z
          .array(z.string())
          .optional()
          .describe("Attribute names to include in output"),
      }),
    },
    async ({ selector, attributes }) => {
      try {
        await connectionManager.verifyTab();
        const attrsArg = attributes ? JSON.stringify(attributes) : "[]";
        const result = await evaluate(`
          (() => {
            const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, 50);
            const attrs = ${attrsArg};
            return JSON.stringify(els.map((el, i) => {
              const item = {
                index: i,
                tagName: el.tagName.toLowerCase(),
                textContent: (el.textContent || '').trim().substring(0, 100),
              };
              if (el.value !== undefined && el.value !== '') item.value = el.value;
              for (const a of attrs) {
                const v = el.getAttribute(a);
                if (v !== null) item[a] = v;
              }
              return item;
            }), null, 2);
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
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
    "inject_css",
    {
      title: "Inject CSS",
      description: "Inject CSS styles into the current page.",
      inputSchema: z.object({
        css: z.string().describe("CSS code to inject"),
      }),
    },
    async ({ css }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`
          (() => {
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
          })()
        `);
        return {
          content: [{ type: "text" as const, text: "CSS injected successfully." }],
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

  server.registerTool(
    "inject_script",
    {
      title: "Inject Script",
      description:
        "Inject a script into the current page. Provide either a URL (src) or inline code.",
      inputSchema: z.object({
        src: z.string().optional().describe("URL of external script to inject"),
        code: z.string().optional().describe("Inline JavaScript code to inject"),
      }),
    },
    async ({ src, code }) => {
      try {
        await connectionManager.verifyTab();
        if (src) {
          await evaluate(`
            new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = ${JSON.stringify(src)};
              s.onload = () => resolve('loaded');
              s.onerror = () => reject(new Error('Failed to load script'));
              document.head.appendChild(s);
            })
          `);
          return {
            content: [{ type: "text" as const, text: `Script loaded from: ${src}` }],
          };
        } else if (code) {
          await evaluate(code);
          return {
            content: [{ type: "text" as const, text: "Script executed." }],
          };
        } else {
          return {
            isError: true,
            content: [
              { type: "text" as const, text: "Provide either src (URL) or code (inline script)." },
            ],
          };
        }
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
    "get_response_body",
    {
      title: "Get Response Body",
      description:
        "Get the response body of a network request by request ID or URL pattern.",
      inputSchema: z.object({
        requestId: z.string().optional().describe("Request ID from network_requests output"),
        urlPattern: z
          .string()
          .optional()
          .describe("URL substring to match the most recent request"),
      }),
    },
    async ({ requestId, urlPattern }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        let targetId = requestId;
        if (!targetId && urlPattern) {
          const requests = connectionManager.getNetworkRequests();
          const match = [...requests].reverse().find((r) => r.url.includes(urlPattern));
          if (!match) {
            return {
              isError: true,
              content: [
                { type: "text" as const, text: `No request found matching: ${urlPattern}` },
              ],
            };
          }
          targetId = match.requestId;
        }
        if (!targetId) {
          return {
            isError: true,
            content: [
              { type: "text" as const, text: "Provide either requestId or urlPattern." },
            ],
          };
        }
        const { body, base64Encoded } = await (client as any).Network.getResponseBody({
          requestId: targetId,
        });
        if (base64Encoded) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Response body (base64, binary content):\n${body.substring(0, 2000)}${body.length > 2000 ? "\n... (truncated)" : ""}`,
              },
            ],
          };
        }
        return { content: [{ type: "text" as const, text: body }] };
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
    "find_elements_with_text",
    {
      title: "Find Elements with Text",
      description:
        "Find elements containing specific text. Optionally limit to a specific tag.",
      inputSchema: z.object({
        text: z.string().describe("Text to search for (case-insensitive)"),
        tag: z
          .string()
          .optional()
          .describe('Limit search to specific tag (e.g. "button", "a", "div")'),
      }),
    },
    async ({ text, tag }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(`
          (() => {
            const searchText = ${JSON.stringify(text)}.toLowerCase();
            const tagFilter = ${JSON.stringify(tag || "")};
            const selector = tagFilter || '*';
            const els = Array.from(document.querySelectorAll(selector));
            const matches = [];
            for (const el of els) {
              const ownText = Array.from(el.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent)
                .join('')
                .trim();
              const fullText = (el.textContent || '').trim();
              if (fullText.toLowerCase().includes(searchText) || ownText.toLowerCase().includes(searchText)) {
                const path = [];
                let current = el;
                while (current && current !== document.body) {
                  let seg = current.tagName.toLowerCase();
                  if (current.id) seg += '#' + current.id;
                  else if (current.className && typeof current.className === 'string') {
                    const cls = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
                    if (cls) seg += '.' + cls;
                  }
                  path.unshift(seg);
                  current = current.parentElement;
                }
                matches.push({
                  selector: path.join(' > '),
                  tagName: el.tagName.toLowerCase(),
                  text: fullText.substring(0, 100),
                });
                if (matches.length >= 20) break;
              }
            }
            return JSON.stringify(matches, null, 2);
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
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
