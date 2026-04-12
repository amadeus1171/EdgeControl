import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";

const DEVICES: Record<
  string,
  { width: number; height: number; deviceScaleFactor: number; mobile: boolean; userAgent: string; touch: boolean }
> = {
  "iPhone SE": { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  "iPhone 14": { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  "iPhone 14 Pro Max": { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  "iPad": { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  "iPad Pro": { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1", touch: true },
  "Pixel 7": { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36", touch: true },
  "Samsung Galaxy S21": { width: 360, height: 800, deviceScaleFactor: 3, mobile: true, userAgent: "Mozilla/5.0 (Linux; Android 12; Samsung SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36", touch: true },
  "Laptop": { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false, userAgent: "", touch: false },
  "Desktop": { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false, userAgent: "", touch: false },
  "Desktop 4K": { width: 3840, height: 2160, deviceScaleFactor: 2, mobile: false, userAgent: "", touch: false },
};

const NETWORK_PRESETS: Record<
  string,
  { offline: boolean; downloadThroughput: number; uploadThroughput: number; latency: number }
> = {
  online: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
  offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
  "slow-3g": { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 },
  "fast-3g": { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  "4g": { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 20 },
};

export function registerEmulateTools(server: McpServer): void {
  server.registerTool(
    "emulate_device",
    {
      title: "Emulate Device",
      description: `Emulate a device viewport, user agent, and touch. Available devices: ${Object.keys(DEVICES).join(", ")}. Use "reset" to clear emulation.`,
      inputSchema: z.object({
        device: z.string().describe('Device name (e.g. "iPhone 14", "iPad Pro", "Desktop") or "reset"'),
      }),
    },
    async ({ device }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        if (device === "reset") {
          await (client as any).Emulation.clearDeviceMetricsOverride();
          await (client as any).Emulation.setUserAgentOverride({ userAgent: "" });
          await (client as any).Emulation.setTouchEmulationEnabled({ enabled: false });
          return {
            content: [{ type: "text" as const, text: "Device emulation reset." }],
          };
        }
        const preset = DEVICES[device];
        if (!preset) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Unknown device: ${device}. Available: ${Object.keys(DEVICES).join(", ")}`,
              },
            ],
          };
        }
        await (client as any).Emulation.setDeviceMetricsOverride({
          width: preset.width,
          height: preset.height,
          deviceScaleFactor: preset.deviceScaleFactor,
          mobile: preset.mobile,
        });
        if (preset.userAgent) {
          await (client as any).Emulation.setUserAgentOverride({ userAgent: preset.userAgent });
        }
        await (client as any).Emulation.setTouchEmulationEnabled({ enabled: preset.touch });
        return {
          content: [
            {
              type: "text" as const,
              text: `Emulating ${device}: ${preset.width}x${preset.height} @${preset.deviceScaleFactor}x, mobile=${preset.mobile}, touch=${preset.touch}`,
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
    "set_geolocation",
    {
      title: "Set Geolocation",
      description: "Override the browser's geolocation.",
      inputSchema: z.object({
        latitude: z.number().describe("Latitude"),
        longitude: z.number().describe("Longitude"),
        accuracy: z.number().optional().describe("Accuracy in meters (default: 100)"),
      }),
    },
    async ({ latitude, longitude, accuracy }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Emulation.setGeolocationOverride({
          latitude,
          longitude,
          accuracy: accuracy ?? 100,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Geolocation set to: ${latitude}, ${longitude} (accuracy: ${accuracy ?? 100}m)`,
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
    "clear_geolocation",
    {
      title: "Clear Geolocation",
      description: "Clear the geolocation override.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Emulation.clearGeolocationOverride();
        return {
          content: [{ type: "text" as const, text: "Geolocation override cleared." }],
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
    "set_color_scheme",
    {
      title: "Set Color Scheme",
      description: "Emulate a preferred color scheme (light/dark).",
      inputSchema: z.object({
        scheme: z.enum(["light", "dark", "no-preference"]).describe("Color scheme to emulate"),
      }),
    },
    async ({ scheme }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Emulation.setEmulatedMedia({
          features: [{ name: "prefers-color-scheme", value: scheme }],
        });
        return {
          content: [
            { type: "text" as const, text: `Color scheme set to: ${scheme}` },
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
    "set_network_conditions",
    {
      title: "Set Network Conditions",
      description:
        "Emulate network conditions. Presets: online, offline, slow-3g, fast-3g, 4g.",
      inputSchema: z.object({
        preset: z.enum(["online", "offline", "slow-3g", "fast-3g", "4g"]).describe("Network preset"),
      }),
    },
    async ({ preset }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const conditions = NETWORK_PRESETS[preset];
        await (client as any).Network.emulateNetworkConditions(conditions);
        return {
          content: [
            { type: "text" as const, text: `Network conditions set to: ${preset}` },
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
    "override_permission",
    {
      title: "Override Permission",
      description:
        "Override a browser permission for the current page origin.",
      inputSchema: z.object({
        permission: z
          .enum(["geolocation", "notifications", "camera", "microphone", "clipboard-read", "clipboard-write"])
          .describe("Permission to override"),
        state: z.enum(["granted", "denied", "prompt"]).describe("Permission state"),
      }),
    },
    async ({ permission, state }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const tabs = await connectionManager.listTabs();
        const currentId = connectionManager.getCurrentTabId();
        const tab = tabs.find((t) => t.id === currentId);
        const origin = tab?.url ? new URL(tab.url).origin : undefined;
        await (client as any).Browser.setPermission({
          permission: { name: permission },
          setting: state,
          origin,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Permission ${permission} set to ${state}${origin ? ` for ${origin}` : ""}`,
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
    "set_timezone",
    {
      title: "Set Timezone",
      description: 'Override the browser timezone (e.g. "America/Los_Angeles", "Europe/London", "UTC").',
      inputSchema: z.object({
        timezoneId: z.string().describe("IANA timezone ID"),
      }),
    },
    async ({ timezoneId }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Emulation.setTimezoneOverride({ timezoneId });
        return {
          content: [
            { type: "text" as const, text: `Timezone set to: ${timezoneId}` },
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
    "reset_emulation",
    {
      title: "Reset Emulation",
      description:
        "Reset ALL emulation overrides: device metrics, user agent, touch, geolocation, color scheme, network conditions, timezone.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        await (client as any).Emulation.clearDeviceMetricsOverride();
        await (client as any).Emulation.setUserAgentOverride({ userAgent: "" });
        await (client as any).Emulation.setTouchEmulationEnabled({ enabled: false });
        await (client as any).Emulation.clearGeolocationOverride();
        await (client as any).Emulation.setEmulatedMedia({ features: [] });
        await (client as any).Network.emulateNetworkConditions({
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0,
        });
        try {
          await (client as any).Emulation.setTimezoneOverride({ timezoneId: "" });
        } catch {
          // Some CDP versions don't support clearing timezone with empty string
        }
        return {
          content: [{ type: "text" as const, text: "All emulation overrides reset." }],
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
