import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import { evaluate } from "../cdp/wrapper.js";

export function registerStorageTools(server: McpServer): void {
  server.registerTool(
    "get_cookies",
    {
      title: "Get Cookies",
      description: "Get cookies for the current page or a specific URL.",
      inputSchema: z.object({
        url: z.string().optional().describe("URL to get cookies for (defaults to current page)"),
      }),
    },
    async ({ url }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        let targetUrl = url;
        if (!targetUrl) {
          targetUrl = await evaluate("window.location.href");
        }
        const { cookies } = await (client as any).Network.getCookies({ urls: [targetUrl] });
        if (!cookies || cookies.length === 0) {
          return { content: [{ type: "text" as const, text: "No cookies found." }] };
        }
        const text = cookies
          .map(
            (c: any) =>
              `${c.name}=${c.value}\n  domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} secure=${c.secure}${c.expires ? ` expires=${new Date(c.expires * 1000).toISOString()}` : ""}`
          )
          .join("\n\n");
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
    "set_cookie",
    {
      title: "Set Cookie",
      description: "Set a browser cookie.",
      inputSchema: z.object({
        name: z.string().describe("Cookie name"),
        value: z.string().describe("Cookie value"),
        domain: z.string().optional().describe("Cookie domain"),
        path: z.string().optional().describe("Cookie path (default: /)"),
        httpOnly: z.boolean().optional().describe("HTTP-only flag"),
        secure: z.boolean().optional().describe("Secure flag"),
        expires: z.number().optional().describe("Expiry as Unix timestamp"),
      }),
    },
    async ({ name, value, domain, path: cookiePath, httpOnly, secure, expires }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const params: any = { name, value, path: cookiePath ?? "/" };
        if (domain) params.domain = domain;
        if (httpOnly !== undefined) params.httpOnly = httpOnly;
        if (secure !== undefined) params.secure = secure;
        if (expires !== undefined) params.expires = expires;

        // If no domain, we need to provide the current URL
        if (!domain) {
          params.url = await evaluate("window.location.href");
        }

        await (client as any).Network.setCookie(params);
        return {
          content: [{ type: "text" as const, text: `Cookie set: ${name}=${value}` }],
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
    "delete_cookie",
    {
      title: "Delete Cookie",
      description: "Delete a browser cookie by name.",
      inputSchema: z.object({
        name: z.string().describe("Cookie name"),
        url: z.string().optional().describe("URL the cookie belongs to (defaults to current page)"),
      }),
    },
    async ({ name, url }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const targetUrl = url ?? (await evaluate("window.location.href"));
        await (client as any).Network.deleteCookies({ name, url: targetUrl });
        return {
          content: [{ type: "text" as const, text: `Cookie deleted: ${name}` }],
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
    "clear_cookies",
    {
      title: "Clear Cookies",
      description: "Clear all browser cookies.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Network.clearBrowserCookies();
        return {
          content: [{ type: "text" as const, text: "All cookies cleared." }],
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
    "get_local_storage",
    {
      title: "Get Local Storage",
      description: "Get all localStorage entries for the current page.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(
          "JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))"
        );
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
    "set_local_storage",
    {
      title: "Set Local Storage",
      description: "Set a localStorage entry.",
      inputSchema: z.object({
        key: z.string().describe("Storage key"),
        value: z.string().describe("Storage value"),
      }),
    },
    async ({ key, value }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`);
        return {
          content: [{ type: "text" as const, text: `localStorage set: ${key}` }],
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
    "remove_local_storage",
    {
      title: "Remove Local Storage",
      description: "Remove a localStorage entry by key.",
      inputSchema: z.object({
        key: z.string().describe("Storage key to remove"),
      }),
    },
    async ({ key }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`localStorage.removeItem(${JSON.stringify(key)})`);
        return {
          content: [{ type: "text" as const, text: `localStorage removed: ${key}` }],
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
    "clear_local_storage",
    {
      title: "Clear Local Storage",
      description: "Clear all localStorage entries.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        await evaluate("localStorage.clear()");
        return {
          content: [{ type: "text" as const, text: "localStorage cleared." }],
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
    "get_session_storage",
    {
      title: "Get Session Storage",
      description: "Get all sessionStorage entries for the current page.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(
          "JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])))"
        );
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
    "set_session_storage",
    {
      title: "Set Session Storage",
      description: "Set a sessionStorage entry.",
      inputSchema: z.object({
        key: z.string().describe("Storage key"),
        value: z.string().describe("Storage value"),
      }),
    },
    async ({ key, value }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`sessionStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`);
        return {
          content: [{ type: "text" as const, text: `sessionStorage set: ${key}` }],
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
    "clear_session_storage",
    {
      title: "Clear Session Storage",
      description: "Clear all sessionStorage entries.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        await evaluate("sessionStorage.clear()");
        return {
          content: [{ type: "text" as const, text: "sessionStorage cleared." }],
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
    "clear_cache",
    {
      title: "Clear Cache",
      description: "Clear the browser disk cache.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Network.clearBrowserCache();
        return {
          content: [{ type: "text" as const, text: "Browser cache cleared." }],
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
