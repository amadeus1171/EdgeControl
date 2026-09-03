import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";
import { evaluatesTo } from "./helpers/fake-cdp.js";

let h: Harness;

function evaluated(index = 0): string {
  return h.fake.client.Runtime.evaluate.mock.calls[index][0].expression;
}

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["dom"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_element_attribute", () => {
  it("returns the attribute value the page reported", async () => {
    evaluatesTo(h.fake, "/login");

    const out = text(await h.server.call("get_element_attribute", {
      selector: "a.cta",
      attribute: "href",
    }));

    expect(out).toBe("/login");
  });

  it("JSON-encodes the selector so a quote cannot break the injected expression", async () => {
    await h.server.call("get_element_attribute", {
      selector: `a[title='it"s']`,
      attribute: "href",
    });

    // Both interpolations arrive as JSON string literals, not bare text.
    expect(evaluated()).toContain(JSON.stringify(`a[title='it"s']`));
    expect(evaluated()).toContain(JSON.stringify("href"));
  });
});

describe("set_element_attribute and remove_element_attribute", () => {
  it("reports what it set", async () => {
    const out = text(await h.server.call("set_element_attribute", {
      selector: "#el",
      attribute: "data-x",
      value: "1",
    }));

    expect(out).toBe('Set data-x="1" on #el');
  });

  it("reports what it removed", async () => {
    const out = text(await h.server.call("remove_element_attribute", {
      selector: "#el",
      attribute: "disabled",
    }));

    expect(out).toBe("Removed disabled from #el");
  });

  it("surfaces the page-side error when the element is missing", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { exception: { description: "Error: Element not found: #gone" } },
    });

    const result = await h.server.call("set_element_attribute", {
      selector: "#gone",
      attribute: "a",
      value: "b",
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Element not found: #gone");
  });
});

describe("get_computed_style", () => {
  it("requests a default property set when none is specified", async () => {
    await h.server.call("get_computed_style", { selector: "#el" });

    const expression = evaluated();
    expect(expression).toContain('"display"');
    expect(expression).toContain('"z-index"');
  });

  it("requests only the properties asked for", async () => {
    await h.server.call("get_computed_style", {
      selector: "#el",
      properties: ["color", "font-size"],
    });

    const expression = evaluated();
    expect(expression).toContain(JSON.stringify(["color", "font-size"]));
    expect(expression).not.toContain('"z-index"');
  });

  it("passes the page's not-found payload straight through", async () => {
    evaluatesTo(h.fake, '{"error":"Element not found"}');

    expect(text(await h.server.call("get_computed_style", { selector: "#gone" }))).toBe(
      '{"error":"Element not found"}'
    );
  });
});

describe("query_elements", () => {
  it("returns the serialized match list", async () => {
    evaluatesTo(h.fake, '[{"index":0,"tagName":"button","textContent":"Go"}]');

    expect(text(await h.server.call("query_elements", { selector: "button" }))).toBe(
      '[{"index":0,"tagName":"button","textContent":"Go"}]'
    );
  });

  it("caps the result set at 50 elements", async () => {
    await h.server.call("query_elements", { selector: "div" });

    expect(evaluated()).toContain(".slice(0, 50)");
  });

  it("passes requested attributes into the page expression", async () => {
    await h.server.call("query_elements", { selector: "a", attributes: ["href", "target"] });

    expect(evaluated()).toContain(JSON.stringify(["href", "target"]));
  });

  it("defaults to no extra attributes", async () => {
    await h.server.call("query_elements", { selector: "a" });

    expect(evaluated()).toContain("const attrs = [];");
  });
});

describe("inject_css", () => {
  it("appends a style element carrying the css", async () => {
    const out = text(await h.server.call("inject_css", { css: "body { color: red }" }));

    expect(evaluated()).toContain(JSON.stringify("body { color: red }"));
    expect(evaluated()).toContain("document.head.appendChild(style)");
    expect(out).toBe("CSS injected successfully.");
  });
});

describe("inject_script", () => {
  it("loads an external script by url", async () => {
    const out = text(await h.server.call("inject_script", { src: "https://cdn.example/x.js" }));

    expect(evaluated()).toContain(JSON.stringify("https://cdn.example/x.js"));
    expect(out).toBe("Script loaded from: https://cdn.example/x.js");
  });

  it("evaluates inline code verbatim", async () => {
    const out = text(await h.server.call("inject_script", { code: "window.x = 1" }));

    expect(evaluated()).toBe("window.x = 1");
    expect(out).toBe("Script executed.");
  });

  it("prefers src when both are given", async () => {
    await h.server.call("inject_script", { src: "https://cdn.example/x.js", code: "window.x=1" });

    expect(evaluated()).toContain("document.head.appendChild(s)");
  });

  it("asks for one of the two when neither is given", async () => {
    const result = await h.server.call("inject_script", {});

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Provide either src (URL) or code (inline script).");
    expect(h.fake.client.Runtime.evaluate).not.toHaveBeenCalled();
  });

  it("reports a failed external load", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { exception: { description: "Error: Failed to load script" } },
    });

    const result = await h.server.call("inject_script", { src: "https://cdn.example/404.js" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Failed to load script");
  });
});

describe("get_response_body", () => {
  beforeEach(() => {
    h.fake.emit("requestWillBeSent", {
      requestId: "req-1",
      request: { url: "https://example.com/api/users", method: "GET" },
    });
    h.fake.emit("requestWillBeSent", {
      requestId: "req-2",
      request: { url: "https://example.com/api/users?page=2", method: "GET" },
    });
  });

  it("fetches by explicit request id", async () => {
    h.fake.client.Network.getResponseBody.mockResolvedValue({
      body: '{"ok":true}',
      base64Encoded: false,
    });

    const out = text(await h.server.call("get_response_body", { requestId: "req-1" }));

    expect(h.fake.client.Network.getResponseBody).toHaveBeenCalledWith({ requestId: "req-1" });
    expect(out).toBe('{"ok":true}');
  });

  it("matches the most recent request when given a url pattern", async () => {
    await h.server.call("get_response_body", { urlPattern: "/api/users" });

    // Both match; the later one wins.
    expect(h.fake.client.Network.getResponseBody).toHaveBeenCalledWith({ requestId: "req-2" });
  });

  it("reports when no captured request matches the pattern", async () => {
    const result = await h.server.call("get_response_body", { urlPattern: "/nothing" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("No request found matching: /nothing");
  });

  it("asks for one of the two identifiers when neither is given", async () => {
    const result = await h.server.call("get_response_body", {});

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Provide either requestId or urlPattern.");
  });

  it("labels a binary body and truncates it", async () => {
    h.fake.client.Network.getResponseBody.mockResolvedValue({
      body: "A".repeat(2500),
      base64Encoded: true,
    });

    const out = text(await h.server.call("get_response_body", { requestId: "req-1" }));

    expect(out).toContain("Response body (base64, binary content):");
    expect(out).toContain("... (truncated)");
    expect(out.length).toBeLessThan(2500);
  });

  it("does not mark a short binary body as truncated", async () => {
    h.fake.client.Network.getResponseBody.mockResolvedValue({
      body: "A".repeat(100),
      base64Encoded: true,
    });

    expect(text(await h.server.call("get_response_body", { requestId: "req-1" }))).not.toContain(
      "truncated"
    );
  });
});

describe("find_elements_with_text", () => {
  it("returns the serialized match list", async () => {
    evaluatesTo(h.fake, '[{"selector":"div > button","tagName":"button","text":"Save"}]');

    const out = text(await h.server.call("find_elements_with_text", { text: "Save" }));

    expect(out).toBe('[{"selector":"div > button","tagName":"button","text":"Save"}]');
  });

  it("searches every element when no tag is given", async () => {
    await h.server.call("find_elements_with_text", { text: "Save" });

    expect(evaluated()).toContain(`const tagFilter = "";`);
    expect(evaluated()).toContain("const selector = tagFilter || '*';");
  });

  it("limits the search to a tag when given", async () => {
    await h.server.call("find_elements_with_text", { text: "Save", tag: "button" });

    expect(evaluated()).toContain(`const tagFilter = "button";`);
  });

  it("lower-cases the needle so the match is case-insensitive", async () => {
    await h.server.call("find_elements_with_text", { text: "SaVe" });

    expect(evaluated()).toContain(`${JSON.stringify("SaVe")}.toLowerCase()`);
  });

  it("caps the match list at 20", async () => {
    await h.server.call("find_elements_with_text", { text: "a" });

    expect(evaluated()).toContain("matches.length >= 20");
  });
});
