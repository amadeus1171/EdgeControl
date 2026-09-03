import { vi, type Mock } from "vitest";

/**
 * A stand-in for the `chrome-remote-interface` module.
 *
 * The real module is the only thing between this codebase and a live browser,
 * so faking it lets every tool run its real logic — selector resolution,
 * coordinate math, CDP call sequencing, output formatting — with no Edge
 * process involved.
 */

export interface FakeTarget {
  id: string;
  type: string;
  title?: string;
  url?: string;
}

type Handler = (params: any) => void;

export interface FakeClient {
  Page: Record<string, Mock>;
  DOM: Record<string, Mock>;
  Runtime: Record<string, Mock>;
  Console: Record<string, Mock>;
  Network: Record<string, Mock>;
  Input: Record<string, Mock>;
  Emulation: Record<string, Mock>;
  Browser: Record<string, Mock>;
  Accessibility: Record<string, Mock>;
  Target: Record<string, Mock>;
  on: Mock;
  close: Mock;
}

export interface FakeCdp {
  /** The module default export: callable, with List/Activate attached. */
  CDP: Mock & { List: Mock; Activate: Mock };
  client: FakeClient;
  targets: FakeTarget[];
  /** Set to make CDP.List reject, simulating Edge not running. */
  listError: Error | null;
  /** Set to make the CDP() connect call reject. */
  connectError: Error | null;
  /** Fire a CDP event into whatever handler the connection registered. */
  emit(event: EmittableEvent, params: any): void;
  /** Handlers registered via client.on("disconnect", ...). */
  fireDisconnect(): void;
  /** Order of CDP method calls, as "Domain.method" strings. */
  callLog: string[];
}

type EmittableEvent =
  | "javascriptDialogOpening"
  | "consoleAPICalled"
  | "requestWillBeSent"
  | "responseReceived"
  | "loadingFinished";

const DEFAULT_TARGETS: FakeTarget[] = [
  { id: "tab-1", type: "page", title: "First Tab", url: "https://example.com/one" },
  { id: "tab-2", type: "page", title: "Second Tab", url: "https://example.com/two" },
  { id: "sw-1", type: "service_worker", title: "Worker", url: "https://example.com/sw.js" },
];

export function createFakeCdp(): FakeCdp {
  const handlers: Record<string, Handler[]> = {};
  const disconnectHandlers: Handler[] = [];
  const callLog: string[] = [];

  /** Builds a domain whose methods resolve to defaults and record their calls. */
  const domain = (
    name: string,
    defaults: Record<string, unknown> = {},
    subscriptions: EmittableEvent[] = []
  ): Record<string, Mock> => {
    const out: Record<string, Mock> = {};
    for (const [method, value] of Object.entries(defaults)) {
      out[method] = vi.fn(async () => {
        callLog.push(`${name}.${method}`);
        return value;
      });
    }
    for (const event of subscriptions) {
      out[event] = vi.fn((cb: Handler) => {
        (handlers[event] ??= []).push(cb);
      });
    }
    return out;
  };

  const client: FakeClient = {
    Page: {
      ...domain(
        "Page",
        {
          enable: undefined,
          navigate: { frameId: "frame-1" },
          reload: undefined,
          loadEventFired: undefined,
          navigateToHistoryEntry: undefined,
          getNavigationHistory: {
            currentIndex: 1,
            entries: [
              { id: 10, url: "https://example.com/first" },
              { id: 11, url: "https://example.com/second" },
              { id: 12, url: "https://example.com/third" },
            ],
          },
          captureScreenshot: { data: "UE5HREFUQQ==" },
          printToPDF: { data: Buffer.from("%PDF-1.4 fake").toString("base64") },
          handleJavaScriptDialog: undefined,
        },
        ["javascriptDialogOpening"]
      ),
    },
    DOM: domain("DOM", {
      enable: undefined,
      getDocument: { root: { nodeId: 1 } },
      querySelector: { nodeId: 42 },
      // A 20x10 box at origin (0,0) -> centroid (10, 5).
      getBoxModel: { model: { content: [0, 0, 20, 0, 20, 10, 0, 10] } },
      focus: undefined,
      scrollIntoViewIfNeeded: undefined,
      setFileInputFiles: undefined,
    }),
    Runtime: {
      ...domain(
        "Runtime",
        {
          enable: undefined,
          evaluate: { result: { value: "" } },
        },
        ["consoleAPICalled"]
      ),
    },
    Console: domain("Console", { enable: undefined }),
    Network: {
      ...domain(
        "Network",
        {
          enable: undefined,
          getCookies: { cookies: [] },
          setCookie: undefined,
          deleteCookies: undefined,
          clearBrowserCookies: undefined,
          clearBrowserCache: undefined,
          emulateNetworkConditions: undefined,
          getResponseBody: { body: "response body", base64Encoded: false },
        },
        ["requestWillBeSent", "responseReceived", "loadingFinished"]
      ),
    },
    Input: domain("Input", {
      dispatchMouseEvent: undefined,
      dispatchKeyEvent: undefined,
    }),
    Emulation: domain("Emulation", {
      setDeviceMetricsOverride: undefined,
      clearDeviceMetricsOverride: undefined,
      setUserAgentOverride: undefined,
      setTouchEmulationEnabled: undefined,
      setGeolocationOverride: undefined,
      clearGeolocationOverride: undefined,
      setEmulatedMedia: undefined,
      setTimezoneOverride: undefined,
    }),
    Browser: domain("Browser", { setPermission: undefined }),
    Accessibility: domain("Accessibility", { getFullAXTree: { nodes: [] } }),
    Target: domain("Target", {
      getTargets: { targetInfos: [] },
      createTarget: { targetId: "tab-new" },
      closeTarget: { success: true },
    }),
    on: vi.fn((event: string, cb: Handler) => {
      if (event === "disconnect") disconnectHandlers.push(cb);
    }),
    close: vi.fn(async () => undefined),
  };

  const fake: FakeCdp = {
    CDP: null as never,
    client,
    targets: [...DEFAULT_TARGETS],
    listError: null,
    connectError: null,
    callLog,
    emit(event, params) {
      for (const cb of handlers[event] ?? []) cb(params);
    },
    fireDisconnect() {
      for (const cb of disconnectHandlers) cb(undefined);
    },
  };

  const CDP = vi.fn(async () => {
    if (fake.connectError) throw fake.connectError;
    return client;
  }) as FakeCdp["CDP"];

  CDP.List = vi.fn(async () => {
    if (fake.listError) throw fake.listError;
    return fake.targets;
  });
  CDP.Activate = vi.fn(async () => undefined);

  fake.CDP = CDP;
  return fake;
}

/** Convenience: make Runtime.evaluate return a plain value for any expression. */
export function evaluatesTo(fake: FakeCdp, value: unknown): void {
  fake.client.Runtime.evaluate.mockResolvedValue({ result: { value } });
}

/** Convenience: make Runtime.evaluate resolve differently per call, in order. */
export function evaluatesInOrder(fake: FakeCdp, values: unknown[]): void {
  let i = 0;
  fake.client.Runtime.evaluate.mockImplementation(async () => ({
    result: { value: values[Math.min(i++, values.length - 1)] },
  }));
}
