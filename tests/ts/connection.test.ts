import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, type Harness } from "./helpers/harness.js";

const CANNOT_CONNECT = "Cannot connect to Edge. Launch the Edge (Debug) shortcut first.";

let h: Harness;

beforeEach(async () => {
  // Fake timers keep the 30s heartbeat interval from outliving the test.
  vi.useFakeTimers();
  h = await loadHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connect", () => {
  it("attaches to the first page target and skips non-page targets", async () => {
    await h.connectionManager.connect();

    expect(h.fake.CDP).toHaveBeenCalledWith(
      expect.objectContaining({ host: "127.0.0.1", port: 9222, target: "tab-1" })
    );
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-1");
  });

  it("reports the launch instruction when Edge is not running", async () => {
    h.fake.listError = new Error("ECONNREFUSED");
    await expect(h.connectionManager.connect()).rejects.toThrow(CANNOT_CONNECT);
  });

  it("reports a distinct error when Edge is running with no open tabs", async () => {
    h.fake.targets = [{ id: "sw-1", type: "service_worker" }];
    await expect(h.connectionManager.connect()).rejects.toThrow(
      "No open tabs found in the Edge debug instance."
    );
  });

  it("enables every domain the tools depend on", async () => {
    await h.connectionManager.connect();

    expect(h.fake.client.Page.enable).toHaveBeenCalled();
    expect(h.fake.client.DOM.enable).toHaveBeenCalled();
    expect(h.fake.client.Runtime.enable).toHaveBeenCalled();
    expect(h.fake.client.Console.enable).toHaveBeenCalled();
    expect(h.fake.client.Network.enable).toHaveBeenCalled();
  });

  it("writes the attached tab to the state file the hook reads", async () => {
    await h.connectionManager.connect();
    await vi.waitFor(() => expect(h.stateWrites.length).toBeGreaterThan(0));

    const written = JSON.parse(h.stateWrites.at(-1)!.contents);
    expect(written).toMatchObject({
      tabId: "tab-1",
      title: "First Tab",
      url: "https://example.com/one",
    });
    expect(written.updatedAt).toEqual(expect.any(String));
  });
});

describe("ensureConnected", () => {
  it("reuses the existing client instead of reconnecting", async () => {
    await h.connectionManager.ensureConnected();
    await h.connectionManager.ensureConnected();
    await h.connectionManager.ensureConnected();

    expect(h.fake.CDP).toHaveBeenCalledTimes(1);
  });

  it("reconnects after the client drops", async () => {
    await h.connectionManager.ensureConnected();
    h.fake.fireDisconnect();

    expect(h.connectionManager.getCurrentTabId()).toBeNull();

    await h.connectionManager.ensureConnected();
    expect(h.fake.CDP).toHaveBeenCalledTimes(2);
  });
});

describe("event capture", () => {
  beforeEach(async () => {
    await h.connectionManager.connect();
  });

  it("records console messages with level and joined args", async () => {
    h.fake.emit("consoleAPICalled", {
      type: "error",
      timestamp: 1000,
      args: [{ value: "Boom:" }, { description: "TypeError" }],
    });

    expect(h.connectionManager.getConsoleMessages()).toEqual([
      { level: "error", text: "Boom: TypeError", timestamp: 1000 },
    ]);
  });

  it("tolerates console args carrying neither value nor description", async () => {
    h.fake.emit("consoleAPICalled", { type: "log", timestamp: 1, args: [{}] });

    expect(h.connectionManager.getConsoleMessages()[0].text).toBe("");
  });

  it("correlates a request with its response status and transfer size", async () => {
    h.fake.emit("requestWillBeSent", {
      requestId: "req-1",
      request: { url: "https://example.com/api", method: "GET" },
    });
    h.fake.emit("responseReceived", { requestId: "req-1", response: { status: 200 } });
    h.fake.emit("loadingFinished", { requestId: "req-1", encodedDataLength: 512 });

    expect(h.connectionManager.getNetworkRequests()).toEqual([
      {
        requestId: "req-1",
        url: "https://example.com/api",
        method: "GET",
        status: 200,
        size: 512,
      },
    ]);
  });

  it("ignores a response for a request it never saw start", async () => {
    h.fake.emit("responseReceived", { requestId: "ghost", response: { status: 500 } });

    expect(h.connectionManager.getNetworkRequests()).toEqual([]);
  });

  it("captures a pending dialog and clears it on demand", async () => {
    h.fake.emit("javascriptDialogOpening", {
      type: "prompt",
      message: "Your name?",
      defaultPrompt: "anon",
    });

    expect(h.connectionManager.getPendingDialog()).toEqual({
      type: "prompt",
      message: "Your name?",
      defaultPrompt: "anon",
    });

    h.connectionManager.clearPendingDialog();
    expect(h.connectionManager.getPendingDialog()).toBeNull();
  });

  it("drops buffered messages when re-attaching to a tab", async () => {
    h.fake.emit("consoleAPICalled", { type: "log", timestamp: 1, args: [{ value: "old" }] });
    h.fake.emit("requestWillBeSent", {
      requestId: "r",
      request: { url: "https://example.com", method: "GET" },
    });

    await h.connectionManager.activateTab("tab-2");

    expect(h.connectionManager.getConsoleMessages()).toEqual([]);
    expect(h.connectionManager.getNetworkRequests()).toEqual([]);
  });

  it("clears buffers on request", async () => {
    h.fake.emit("consoleAPICalled", { type: "log", timestamp: 1, args: [{ value: "x" }] });
    h.fake.emit("requestWillBeSent", {
      requestId: "r",
      request: { url: "https://example.com", method: "GET" },
    });

    h.connectionManager.clearConsoleMessages();
    h.connectionManager.clearNetworkRequests();

    expect(h.connectionManager.getConsoleMessages()).toEqual([]);
    expect(h.connectionManager.getNetworkRequests()).toEqual([]);
  });
});

describe("listTabs", () => {
  it("returns only page targets", async () => {
    const tabs = await h.connectionManager.listTabs();

    expect(tabs).toEqual([
      { id: "tab-1", title: "First Tab", url: "https://example.com/one" },
      { id: "tab-2", title: "Second Tab", url: "https://example.com/two" },
    ]);
  });

  it("substitutes 'unknown' for a target missing title or url", async () => {
    h.fake.targets = [{ id: "bare", type: "page" }];

    expect(await h.connectionManager.listTabs()).toEqual([
      { id: "bare", title: "unknown", url: "unknown" },
    ]);
  });

  it("translates a transport failure into the launch instruction", async () => {
    h.fake.listError = new Error("ECONNREFUSED");
    await expect(h.connectionManager.listTabs()).rejects.toThrow(CANNOT_CONNECT);
  });
});

describe("verifyTab", () => {
  it("reports no change while the attached tab is still open", async () => {
    await h.connectionManager.connect();

    expect(await h.connectionManager.verifyTab()).toEqual({ reattached: false });
  });

  it("connects and says so when nothing is attached yet", async () => {
    const result = await h.connectionManager.verifyTab();

    expect(result).toEqual({ reattached: true, message: "Reconnected to Edge." });
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-1");
  });

  it("reattaches to a surviving tab after the attached one is closed", async () => {
    await h.connectionManager.connect();
    // tab-1 disappears; tab-2 remains.
    h.fake.targets = [
      { id: "tab-2", type: "page", title: "Second Tab", url: "https://example.com/two" },
    ];

    const result = await h.connectionManager.verifyTab();

    expect(result.reattached).toBe(true);
    expect(result.message).toContain("Previous tab was closed");
    expect(result.message).toContain("Second Tab");
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-2");
  });
});

describe("reconnect", () => {
  it("retries with exponential backoff and gives up after 4 attempts", async () => {
    h.fake.listError = new Error("down");

    const attempt = h.connectionManager.reconnect();
    const assertion = expect(attempt).rejects.toThrow(CANNOT_CONNECT);

    // 500ms + 1000ms + 2000ms of backoff between the four attempts.
    await vi.advanceTimersByTimeAsync(3500);
    await assertion;

    expect(h.fake.CDP.List).toHaveBeenCalledTimes(4);
  });

  it("stops retrying as soon as a connection succeeds", async () => {
    h.fake.listError = new Error("down");

    const attempt = h.connectionManager.reconnect();
    await vi.advanceTimersByTimeAsync(500);
    h.fake.listError = null;
    await vi.advanceTimersByTimeAsync(1000);

    await expect(attempt).resolves.toBe(h.fake.client);
    expect(h.fake.CDP.List.mock.calls.length).toBeLessThan(4);
  });
});

describe("tab management", () => {
  it("activates a tab, reattaches, and records it in the state file", async () => {
    await h.connectionManager.connect();
    h.stateWrites.length = 0;

    const tab = await h.connectionManager.activateTab("tab-2");

    expect(h.fake.CDP.Activate).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-2" }));
    expect(tab).toEqual({
      id: "tab-2",
      title: "Second Tab",
      url: "https://example.com/two",
    });
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-2");
    await vi.waitFor(() => expect(h.stateWrites.length).toBeGreaterThan(0));
  });

  it("closes the previous client when switching tabs", async () => {
    await h.connectionManager.connect();
    await h.connectionManager.activateTab("tab-2");

    expect(h.fake.client.close).toHaveBeenCalled();
  });

  it("still switches when closing the previous client throws", async () => {
    await h.connectionManager.connect();
    h.fake.client.close.mockRejectedValueOnce(new Error("already gone"));

    await expect(h.connectionManager.activateTab("tab-2")).resolves.toMatchObject({
      id: "tab-2",
    });
  });

  it("opens a new tab at about:blank by default", async () => {
    await h.connectionManager.openNewTab();

    expect(h.fake.client.Target.createTarget).toHaveBeenCalledWith({ url: "about:blank" });
  });

  it("opens a new tab at the requested url", async () => {
    await h.connectionManager.openNewTab("https://example.com/new");

    expect(h.fake.client.Target.createTarget).toHaveBeenCalledWith({
      url: "https://example.com/new",
    });
  });

  it("reattaches after closing the tab it was attached to", async () => {
    await h.connectionManager.connect();

    await h.connectionManager.closeTab("tab-1");

    expect(h.fake.client.Target.closeTarget).toHaveBeenCalledWith({ targetId: "tab-1" });
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-1");
  });

  it("leaves the attachment alone when closing a different tab", async () => {
    await h.connectionManager.connect();
    h.fake.CDP.mockClear();

    await h.connectionManager.closeTab("tab-2");

    expect(h.fake.CDP).not.toHaveBeenCalled();
    expect(h.connectionManager.getCurrentTabId()).toBe("tab-1");
  });
});
