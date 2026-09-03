import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["tab"]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("list_tabs", () => {
  it("lists every page target with title, url and id", async () => {
    const out = text(await h.server.call("list_tabs"));

    expect(out).toContain("First Tab");
    expect(out).toContain("https://example.com/one");
    expect(out).toContain("id: tab-1");
    expect(out).toContain("Second Tab");
  });

  it("marks the attached tab with an asterisk and indents the others", async () => {
    await h.connectionManager.connect();

    const out = text(await h.server.call("list_tabs"));

    expect(out).toContain("* First Tab");
    expect(out).toContain("  Second Tab");
  });

  it("says so when no tabs are open", async () => {
    h.fake.targets = [];

    expect(text(await h.server.call("list_tabs"))).toBe("No tabs open.");
  });

  it("returns an error result, not a throw, when Edge is unreachable", async () => {
    h.fake.listError = new Error("ECONNREFUSED");

    const result = await h.server.call("list_tabs");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Cannot connect to Edge. Launch the Edge (Debug) shortcut first.");
  });
});

describe("get_active_tab", () => {
  it("reports the attached tab", async () => {
    await h.connectionManager.connect();

    const out = text(await h.server.call("get_active_tab"));

    expect(out).toContain("Title: First Tab");
    expect(out).toContain("URL: https://example.com/one");
    expect(out).toContain("ID: tab-1");
  });

  it("prefixes the reattachment notice when the connection was re-established", async () => {
    const out = text(await h.server.call("get_active_tab"));

    expect(out).toContain("Reconnected to Edge.");
    expect(out).toContain("Title: First Tab");
  });

  it("reports no active tab when the attachment cannot be matched", async () => {
    await h.connectionManager.connect();
    // Verification passes on a stale list, but the tab is gone by the time it is looked up.
    h.connectionManager.verifyTab = vi.fn(async () => ({ reattached: false })) as never;
    h.fake.targets = [];

    expect(text(await h.server.call("get_active_tab"))).toBe("No active tab.");
  });

  it("surfaces a connection failure as an error result", async () => {
    h.fake.listError = new Error("ECONNREFUSED");

    const result = await h.server.call("get_active_tab");

    expect(result.isError).toBe(true);
  });
});

describe("new_tab", () => {
  it("opens about:blank when no url is given", async () => {
    await h.server.call("new_tab", {});

    expect(h.fake.client.Target.createTarget).toHaveBeenCalledWith({ url: "about:blank" });
  });

  it("opens the requested url and reports the resulting tab", async () => {
    h.fake.client.Target.createTarget.mockResolvedValue({ targetId: "tab-2" });

    const out = text(await h.server.call("new_tab", { url: "https://example.com/two" }));

    expect(h.fake.client.Target.createTarget).toHaveBeenCalledWith({
      url: "https://example.com/two",
    });
    expect(out).toContain("New tab opened: Second Tab");
    expect(out).toContain("ID: tab-2");
  });

  it("returns an error result when the target cannot be created", async () => {
    h.fake.client.Target.createTarget.mockRejectedValue(new Error("target creation failed"));

    const result = await h.server.call("new_tab", {});

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("target creation failed");
  });
});

describe("activate_tab", () => {
  it("switches to the requested tab and reports it", async () => {
    const out = text(await h.server.call("activate_tab", { tabId: "tab-2" }));

    expect(h.fake.CDP.Activate).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-2" }));
    expect(out).toContain("Switched to: Second Tab");
    expect(out).toContain("ID: tab-2");
  });

  it("returns an error result for an unknown tab id", async () => {
    h.fake.CDP.Activate.mockRejectedValue(new Error("No such target id: nope"));

    const result = await h.server.call("activate_tab", { tabId: "nope" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("No such target id");
  });
});

describe("close_tab", () => {
  it("closes the requested tab", async () => {
    const out = text(await h.server.call("close_tab", { tabId: "tab-2" }));

    expect(h.fake.client.Target.closeTarget).toHaveBeenCalledWith({ targetId: "tab-2" });
    expect(out).toBe("Closed tab: tab-2");
  });

  it("returns an error result when the close fails", async () => {
    h.fake.client.Target.closeTarget.mockRejectedValue(new Error("cannot close"));

    const result = await h.server.call("close_tab", { tabId: "tab-1" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("cannot close");
  });
});
