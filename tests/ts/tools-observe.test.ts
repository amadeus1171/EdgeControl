import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["observe"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

function logConsole(level: string, message: string): void {
  h.fake.emit("consoleAPICalled", { type: level, timestamp: 1, args: [{ value: message }] });
}

function logRequest(requestId: string, url: string, method = "GET"): void {
  h.fake.emit("requestWillBeSent", { requestId, request: { url, method } });
}

describe("console_messages", () => {
  it("says so when nothing was captured", async () => {
    expect(text(await h.server.call("console_messages", {}))).toBe(
      "No console messages captured."
    );
  });

  it("returns every message when unfiltered", async () => {
    logConsole("log", "hello");
    logConsole("error", "boom");

    const out = text(await h.server.call("console_messages", {}));

    expect(out).toBe("[log] hello\n[error] boom");
  });

  it("keeps only errors at level 'error'", async () => {
    logConsole("log", "hello");
    logConsole("warning", "careful");
    logConsole("error", "boom");

    const out = text(await h.server.call("console_messages", { level: "error" }));

    expect(out).toBe("[error] boom");
  });

  it("keeps warnings and errors at level 'warn'", async () => {
    logConsole("log", "hello");
    logConsole("warning", "careful");
    logConsole("error", "boom");

    const out = text(await h.server.call("console_messages", { level: "warn" }));

    expect(out).toBe("[warning] careful\n[error] boom");
  });

  it("reports an empty filter result rather than an empty string", async () => {
    logConsole("log", "hello");

    expect(text(await h.server.call("console_messages", { level: "error" }))).toBe(
      "No console messages captured."
    );
  });

  it("clears the buffer only when asked", async () => {
    logConsole("log", "hello");

    await h.server.call("console_messages", {});
    expect(h.connectionManager.getConsoleMessages()).toHaveLength(1);

    await h.server.call("console_messages", { clear: true });
    expect(h.connectionManager.getConsoleMessages()).toHaveLength(0);
  });

  it("returns the messages it just cleared, not an empty result", async () => {
    logConsole("error", "boom");

    expect(text(await h.server.call("console_messages", { clear: true }))).toBe("[error] boom");
  });
});

describe("network_requests", () => {
  it("says so when nothing was captured", async () => {
    expect(text(await h.server.call("network_requests", {}))).toBe(
      "No network requests captured."
    );
  });

  it("shows an in-flight request with a placeholder status", async () => {
    logRequest("r1", "https://example.com/api");

    expect(text(await h.server.call("network_requests", {}))).toBe(
      "GET ... https://example.com/api"
    );
  });

  it("shows status and size once the response has finished", async () => {
    logRequest("r1", "https://example.com/api", "POST");
    h.fake.emit("responseReceived", { requestId: "r1", response: { status: 201 } });
    h.fake.emit("loadingFinished", { requestId: "r1", encodedDataLength: 42 });

    expect(text(await h.server.call("network_requests", {}))).toBe(
      "POST 201 https://example.com/api (42B)"
    );
  });

  it("reports a zero-byte response as 0B rather than omitting the size", async () => {
    logRequest("r1", "https://example.com/empty");
    h.fake.emit("loadingFinished", { requestId: "r1", encodedDataLength: 0 });

    expect(text(await h.server.call("network_requests", {}))).toContain("(0B)");
  });

  it("filters by url substring", async () => {
    logRequest("r1", "https://example.com/api/users");
    logRequest("r2", "https://cdn.example.com/logo.png");

    const out = text(await h.server.call("network_requests", { urlPattern: "/api/" }));

    expect(out).toContain("/api/users");
    expect(out).not.toContain("logo.png");
  });

  it("reports an empty filter result rather than an empty string", async () => {
    logRequest("r1", "https://example.com/api");

    expect(text(await h.server.call("network_requests", { urlPattern: "nomatch" }))).toBe(
      "No network requests captured."
    );
  });

  it("clears the whole buffer even when a filter was applied", async () => {
    logRequest("r1", "https://example.com/api");
    logRequest("r2", "https://cdn.example.com/logo.png");

    await h.server.call("network_requests", { urlPattern: "/api", clear: true });

    expect(h.connectionManager.getNetworkRequests()).toHaveLength(0);
  });

  it("returns an error result when the tab cannot be verified", async () => {
    h.fake.listError = new Error("ECONNREFUSED");
    h.fake.fireDisconnect();

    const result = await h.server.call("network_requests", {});

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Cannot connect to Edge");
  });
});
