import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["navigate"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("navigate", () => {
  it("navigates and waits for the load event before reporting", async () => {
    const out = text(await h.server.call("navigate", { url: "https://example.com/target" }));

    expect(h.fake.client.Page.navigate).toHaveBeenCalledWith({
      url: "https://example.com/target",
    });
    expect(h.fake.client.Page.loadEventFired).toHaveBeenCalled();
    expect(h.fake.callLog).toEqual(
      expect.arrayContaining(["Page.navigate", "Page.loadEventFired"])
    );
    expect(h.fake.callLog.indexOf("Page.navigate")).toBeLessThan(
      h.fake.callLog.indexOf("Page.loadEventFired")
    );
    expect(out).toBe("Navigated to: https://example.com/target");
  });

  it("returns an error result when navigation is rejected", async () => {
    h.fake.client.Page.navigate.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));

    const result = await h.server.call("navigate", { url: "https://nope.invalid" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("net::ERR_NAME_NOT_RESOLVED");
  });

  it("returns an error result when Edge is unreachable", async () => {
    h.fake.listError = new Error("ECONNREFUSED");

    const result = await h.server.call("navigate", { url: "https://example.com" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Cannot connect to Edge");
  });
});

describe("go_back", () => {
  it("navigates to the previous history entry", async () => {
    const out = text(await h.server.call("go_back"));

    // Default history sits at index 1 of three entries.
    expect(h.fake.client.Page.navigateToHistoryEntry).toHaveBeenCalledWith({ entryId: 10 });
    expect(out).toBe("Went back to: https://example.com/first");
  });

  it("does nothing at the start of history", async () => {
    h.fake.client.Page.getNavigationHistory.mockResolvedValue({
      currentIndex: 0,
      entries: [{ id: 10, url: "https://example.com/first" }],
    });

    const out = text(await h.server.call("go_back"));

    expect(h.fake.client.Page.navigateToHistoryEntry).not.toHaveBeenCalled();
    expect(out).toBe("Already at the beginning of history.");
  });
});

describe("go_forward", () => {
  it("navigates to the next history entry", async () => {
    const out = text(await h.server.call("go_forward"));

    expect(h.fake.client.Page.navigateToHistoryEntry).toHaveBeenCalledWith({ entryId: 12 });
    expect(out).toBe("Went forward to: https://example.com/third");
  });

  it("does nothing at the end of history", async () => {
    h.fake.client.Page.getNavigationHistory.mockResolvedValue({
      currentIndex: 1,
      entries: [
        { id: 10, url: "https://example.com/first" },
        { id: 11, url: "https://example.com/second" },
      ],
    });

    const out = text(await h.server.call("go_forward"));

    expect(h.fake.client.Page.navigateToHistoryEntry).not.toHaveBeenCalled();
    expect(out).toBe("Already at the end of history.");
  });

  it("returns an error result when history cannot be read", async () => {
    h.fake.client.Page.getNavigationHistory.mockRejectedValue(new Error("no history"));

    const result = await h.server.call("go_forward");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("no history");
  });
});

describe("reload", () => {
  it("reloads and waits for the load event", async () => {
    const out = text(await h.server.call("reload"));

    expect(h.fake.client.Page.reload).toHaveBeenCalled();
    expect(h.fake.client.Page.loadEventFired).toHaveBeenCalled();
    expect(out).toBe("Page reloaded.");
  });

  it("returns an error result when the reload fails", async () => {
    h.fake.client.Page.reload.mockRejectedValue(new Error("detached"));

    const result = await h.server.call("reload");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("detached");
  });
});
