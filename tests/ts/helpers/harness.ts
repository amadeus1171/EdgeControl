import { vi } from "vitest";
import { createFakeCdp, type FakeCdp } from "./fake-cdp.js";

/**
 * Captures what a tool module registers, so handlers can be invoked directly
 * without standing up a real MCP server or stdio transport.
 */
export interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
}

export interface RegisteredTool {
  name: string;
  config: { title: string; description: string; inputSchema: unknown };
  handler: (args: any) => Promise<ToolResult>;
}

export class FakeMcpServer {
  readonly tools = new Map<string, RegisteredTool>();

  registerTool(name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]): void {
    if (this.tools.has(name)) {
      throw new Error(`Duplicate tool registration: ${name}`);
    }
    this.tools.set(name, { name, config, handler });
  }

  /** Invoke a registered tool the way the MCP runtime would. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool.handler(args);
  }

  get names(): string[] {
    return [...this.tools.keys()];
  }
}

/**
 * Static thunks, not dynamic specifiers: the bundler must be able to see each
 * import to rewrite it, and a computed specifier would defeat vi.resetModules.
 */
const REGISTRARS = {
  tab: async () => (await import("../../../src/tools/tab.js")).registerTabTools,
  page: async () => (await import("../../../src/tools/page.js")).registerPageTools,
  interact: async () => (await import("../../../src/tools/interact.js")).registerInteractTools,
  navigate: async () => (await import("../../../src/tools/navigate.js")).registerNavigateTools,
  observe: async () => (await import("../../../src/tools/observe.js")).registerObserveTools,
  emulate: async () => (await import("../../../src/tools/emulate.js")).registerEmulateTools,
  storage: async () => (await import("../../../src/tools/storage.js")).registerStorageTools,
  dialog: async () => (await import("../../../src/tools/dialog.js")).registerDialogTools,
  dom: async () => (await import("../../../src/tools/dom.js")).registerDomTools,
} as const;

export type ToolModule = keyof typeof REGISTRARS;

export interface Harness {
  fake: FakeCdp;
  server: FakeMcpServer;
  connectionManager: typeof import("../../../src/cdp/connection.js").connectionManager;
  wrapper: typeof import("../../../src/cdp/wrapper.js");
  /** Files written by the connection's best-effort state file, newest last. */
  stateWrites: Array<{ path: string; contents: string }>;
  /** Files written synchronously (print_to_pdf). */
  syncWrites: Array<{ path: string; bytes: Buffer }>;
}

/**
 * Fresh modules per test. The connection manager is a module-level singleton
 * holding a live client and timers, so each test needs its own copy rather
 * than inheriting the previous test's connection state.
 */
export async function loadHarness(modules: ToolModule[] = []): Promise<Harness> {
  vi.resetModules();

  const fake = createFakeCdp();
  const stateWrites: Harness["stateWrites"] = [];
  const syncWrites: Harness["syncWrites"] = [];

  vi.doMock("chrome-remote-interface", () => ({ default: fake.CDP }));

  vi.doMock("fs/promises", () => ({
    writeFile: vi.fn(async (path: string, contents: string) => {
      stateWrites.push({ path, contents });
    }),
  }));

  const writeFileSync = vi.fn((path: string, bytes: Buffer) => {
    syncWrites.push({ path, bytes });
  });
  vi.doMock("fs", () => ({
    writeFileSync,
    default: { writeFileSync },
  }));

  const connection = await import("../../../src/cdp/connection.js");
  const wrapper = await import("../../../src/cdp/wrapper.js");

  const server = new FakeMcpServer();
  for (const mod of modules) {
    const register = await REGISTRARS[mod]();
    register(server as never);
  }

  return {
    fake,
    server,
    connectionManager: connection.connectionManager,
    wrapper,
    stateWrites,
    syncWrites,
  };
}

/** The text of a single-part tool result. */
export function text(result: ToolResult): string {
  return result.content.map((c) => c.text ?? "").join("");
}
