import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";
import { evaluatesTo } from "./helpers/fake-cdp.js";

let h: Harness;

/** The expression passed to the Nth Runtime.evaluate call. */
function evaluated(index = 0): string {
  return h.fake.client.Runtime.evaluate.mock.calls[index][0].expression;
}

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["storage"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_cookies", () => {
  it("falls back to the current page url when none is given", async () => {
    evaluatesTo(h.fake, "https://example.com/page");

    await h.server.call("get_cookies", {});

    expect(evaluated()).toBe("window.location.href");
    expect(h.fake.client.Network.getCookies).toHaveBeenCalledWith({
      urls: ["https://example.com/page"],
    });
  });

  it("uses the supplied url without querying the page", async () => {
    await h.server.call("get_cookies", { url: "https://other.example" });

    expect(h.fake.client.Network.getCookies).toHaveBeenCalledWith({
      urls: ["https://other.example"],
    });
    expect(h.fake.client.Runtime.evaluate).not.toHaveBeenCalled();
  });

  it("says so when the page has no cookies", async () => {
    h.fake.client.Network.getCookies.mockResolvedValue({ cookies: [] });

    expect(text(await h.server.call("get_cookies", { url: "https://example.com" }))).toBe(
      "No cookies found."
    );
  });

  it("formats each cookie with its flags", async () => {
    h.fake.client.Network.getCookies.mockResolvedValue({
      cookies: [
        {
          name: "session",
          value: "abc123",
          domain: "example.com",
          path: "/",
          httpOnly: true,
          secure: true,
        },
      ],
    });

    const out = text(await h.server.call("get_cookies", { url: "https://example.com" }));

    expect(out).toContain("session=abc123");
    expect(out).toContain("domain=example.com path=/ httpOnly=true secure=true");
  });

  it("renders an expiry as an ISO date", async () => {
    h.fake.client.Network.getCookies.mockResolvedValue({
      cookies: [
        {
          name: "a",
          value: "b",
          domain: "example.com",
          path: "/",
          httpOnly: false,
          secure: false,
          // CDP reports expiry in seconds, not milliseconds.
          expires: 1700000000,
        },
      ],
    });

    const out = text(await h.server.call("get_cookies", { url: "https://example.com" }));

    expect(out).toContain(`expires=${new Date(1700000000 * 1000).toISOString()}`);
  });
});

describe("set_cookie", () => {
  it("defaults the path to / and attaches the page url when no domain is given", async () => {
    evaluatesTo(h.fake, "https://example.com/page");

    const out = text(await h.server.call("set_cookie", { name: "a", value: "b" }));

    expect(h.fake.client.Network.setCookie).toHaveBeenCalledWith({
      name: "a",
      value: "b",
      path: "/",
      url: "https://example.com/page",
    });
    expect(out).toBe("Cookie set: a=b");
  });

  it("omits the url when an explicit domain is given", async () => {
    await h.server.call("set_cookie", {
      name: "a",
      value: "b",
      domain: "example.com",
      path: "/app",
      httpOnly: true,
      secure: false,
      expires: 1700000000,
    });

    expect(h.fake.client.Network.setCookie).toHaveBeenCalledWith({
      name: "a",
      value: "b",
      path: "/app",
      domain: "example.com",
      httpOnly: true,
      secure: false,
      expires: 1700000000,
    });
  });

  it("keeps a false flag rather than dropping it as absent", async () => {
    await h.server.call("set_cookie", {
      name: "a",
      value: "b",
      domain: "example.com",
      httpOnly: false,
    });

    const [params] = h.fake.client.Network.setCookie.mock.calls[0];
    expect(params.httpOnly).toBe(false);
  });
});

describe("delete_cookie", () => {
  it("deletes by name against the current page url", async () => {
    evaluatesTo(h.fake, "https://example.com/page");

    const out = text(await h.server.call("delete_cookie", { name: "session" }));

    expect(h.fake.client.Network.deleteCookies).toHaveBeenCalledWith({
      name: "session",
      url: "https://example.com/page",
    });
    expect(out).toBe("Cookie deleted: session");
  });

  it("deletes against an explicit url", async () => {
    await h.server.call("delete_cookie", { name: "s", url: "https://other.example" });

    expect(h.fake.client.Network.deleteCookies).toHaveBeenCalledWith({
      name: "s",
      url: "https://other.example",
    });
  });
});

describe("clear_cookies and clear_cache", () => {
  it("clears all cookies", async () => {
    const out = text(await h.server.call("clear_cookies"));

    expect(h.fake.client.Network.clearBrowserCookies).toHaveBeenCalled();
    expect(out).toBe("All cookies cleared.");
  });

  it("clears the disk cache", async () => {
    const out = text(await h.server.call("clear_cache"));

    expect(h.fake.client.Network.clearBrowserCache).toHaveBeenCalled();
    expect(out).toBe("Browser cache cleared.");
  });

  it("returns an error result when clearing cookies fails", async () => {
    h.fake.client.Network.clearBrowserCookies.mockRejectedValue(new Error("denied"));

    const result = await h.server.call("clear_cookies");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("denied");
  });
});

describe("localStorage", () => {
  it("returns the serialized contents", async () => {
    evaluatesTo(h.fake, '{"theme":"dark"}');

    expect(text(await h.server.call("get_local_storage"))).toBe('{"theme":"dark"}');
  });

  it("JSON-encodes the key and value so quotes cannot break out", async () => {
    await h.server.call("set_local_storage", { key: 'a"b', value: "it's" });

    expect(evaluated()).toBe('localStorage.setItem("a\\"b", "it\'s")');
  });

  it("removes a single key", async () => {
    const out = text(await h.server.call("remove_local_storage", { key: "theme" }));

    expect(evaluated()).toBe('localStorage.removeItem("theme")');
    expect(out).toBe("localStorage removed: theme");
  });

  it("clears everything", async () => {
    const out = text(await h.server.call("clear_local_storage"));

    expect(evaluated()).toBe("localStorage.clear()");
    expect(out).toBe("localStorage cleared.");
  });

  it("returns an error result when the page blocks storage access", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { text: "SecurityError: access denied" },
    });

    const result = await h.server.call("get_local_storage");

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("SecurityError");
  });
});

describe("sessionStorage", () => {
  it("returns the serialized contents", async () => {
    evaluatesTo(h.fake, '{"step":"2"}');

    expect(text(await h.server.call("get_session_storage"))).toBe('{"step":"2"}');
  });

  it("sets a key", async () => {
    const out = text(await h.server.call("set_session_storage", { key: "step", value: "2" }));

    expect(evaluated()).toBe('sessionStorage.setItem("step", "2")');
    expect(out).toBe("sessionStorage set: step");
  });

  it("clears everything", async () => {
    const out = text(await h.server.call("clear_session_storage"));

    expect(evaluated()).toBe("sessionStorage.clear()");
    expect(out).toBe("sessionStorage cleared.");
  });
});
