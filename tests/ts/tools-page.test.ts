import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";
import { evaluatesTo, evaluatesInOrder } from "./helpers/fake-cdp.js";

let h: Harness;

function evaluated(index = 0): string {
  return h.fake.client.Runtime.evaluate.mock.calls[index][0].expression;
}

beforeEach(async () => {
  // shouldAdvanceTime lets wait_for_element's real polling loop make progress
  // without the test waiting on a wall clock.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h = await loadHarness(["page"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("screenshot", () => {
  it("returns an image part, not text", async () => {
    h.fake.client.Page.captureScreenshot.mockResolvedValue({ data: "QUJD" });

    const result = await h.server.call("screenshot");

    expect(result.content).toEqual([{ type: "image", data: "QUJD", mimeType: "image/png" }]);
  });

  it("returns an error result when the capture fails", async () => {
    h.fake.client.Page.captureScreenshot.mockRejectedValue(new Error("capture failed"));

    const result = await h.server.call("screenshot");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("capture failed");
  });
});

describe("get_page_text", () => {
  it("returns the page's innerText", async () => {
    evaluatesTo(h.fake, "Hello world");

    expect(text(await h.server.call("get_page_text"))).toBe("Hello world");
    expect(evaluated()).toBe("document.body.innerText");
  });
});

describe("get_dom", () => {
  it("renders the accessibility tree", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({
      nodes: [{ role: { value: "button" }, name: { value: "Save" } }],
    });

    expect(text(await h.server.call("get_dom", {}))).toBe("[button] Save");
  });

  it("reports an empty page rather than an empty string", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({ nodes: [] });

    expect(text(await h.server.call("get_dom", {}))).toBe("Empty page.");
  });

  it("passes the depth limit through", async () => {
    await h.server.call("get_dom", { depth: 2 });

    expect(h.fake.client.Accessibility.getFullAXTree).toHaveBeenCalledWith({ depth: 2 });
  });
});

describe("evaluate_js", () => {
  it("returns the evaluated result", async () => {
    evaluatesTo(h.fake, 42);

    expect(text(await h.server.call("evaluate_js", { expression: "6*7" }))).toBe("42");
  });

  it("reports a page-side exception as an error result", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { exception: { description: "ReferenceError: nope" } },
    });

    const result = await h.server.call("evaluate_js", { expression: "nope" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("ReferenceError: nope");
  });
});

describe("full_page_screenshot", () => {
  it("resizes to the full scroll extent, captures, then restores the viewport", async () => {
    evaluatesTo(h.fake, JSON.stringify({ w: 1280, h: 4000 }));

    const result = await h.server.call("full_page_screenshot");

    expect(h.fake.client.Emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 1280,
      height: 4000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    expect(result.content[0].type).toBe("image");
    // The override must be undone, or every later screenshot is the wrong size.
    expect(h.fake.callLog.indexOf("Emulation.setDeviceMetricsOverride")).toBeLessThan(
      h.fake.callLog.indexOf("Page.captureScreenshot")
    );
    expect(h.fake.callLog.indexOf("Page.captureScreenshot")).toBeLessThan(
      h.fake.callLog.indexOf("Emulation.clearDeviceMetricsOverride")
    );
  });

  it("returns an error result when the page dimensions cannot be read", async () => {
    evaluatesTo(h.fake, "not json");

    const result = await h.server.call("full_page_screenshot");

    expect(result.isError).toBe(true);
  });

  it("restores the viewport when the capture throws", async () => {
    // Without this, a failed capture would leave the viewport overridden at the
    // full scroll height and every later screenshot would be the wrong size.
    evaluatesTo(h.fake, JSON.stringify({ w: 800, h: 600 }));
    h.fake.client.Page.captureScreenshot.mockRejectedValue(new Error("boom"));

    const result = await h.server.call("full_page_screenshot");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("boom");
    expect(h.fake.client.Emulation.clearDeviceMetricsOverride).toHaveBeenCalled();
  });

  it("reports the capture error, not the restore error, when both fail", async () => {
    evaluatesTo(h.fake, JSON.stringify({ w: 800, h: 600 }));
    h.fake.client.Page.captureScreenshot.mockRejectedValue(new Error("capture failed"));
    h.fake.client.Emulation.clearDeviceMetricsOverride.mockRejectedValue(
      new Error("restore failed")
    );

    const result = await h.server.call("full_page_screenshot");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("capture failed");
  });

  it("surfaces a restore failure when the capture itself succeeded", async () => {
    evaluatesTo(h.fake, JSON.stringify({ w: 800, h: 600 }));
    h.fake.client.Emulation.clearDeviceMetricsOverride.mockRejectedValue(
      new Error("restore failed")
    );

    const result = await h.server.call("full_page_screenshot");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("restore failed");
  });

  it("leaves no override behind across a failure and a later success", async () => {
    evaluatesTo(h.fake, JSON.stringify({ w: 800, h: 600 }));
    h.fake.client.Page.captureScreenshot.mockRejectedValueOnce(new Error("boom"));

    await h.server.call("full_page_screenshot");
    const second = await h.server.call("full_page_screenshot");

    expect(second.isError).toBeUndefined();
    // Both runs set an override, and both cleared it.
    expect(h.fake.client.Emulation.setDeviceMetricsOverride).toHaveBeenCalledTimes(2);
    expect(h.fake.client.Emulation.clearDeviceMetricsOverride).toHaveBeenCalledTimes(2);
  });
});

describe("print_to_pdf", () => {
  it("writes the decoded pdf to a temp file and reports the path", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 hello");
    h.fake.client.Page.printToPDF.mockResolvedValue({ data: pdfBytes.toString("base64") });

    const out = text(await h.server.call("print_to_pdf"));

    expect(h.fake.client.Page.printToPDF).toHaveBeenCalledWith({ printBackground: true });
    expect(h.syncWrites).toHaveLength(1);
    expect(h.syncWrites[0].bytes.equals(pdfBytes)).toBe(true);
    expect(out).toContain("PDF saved to:");
    expect(out).toContain(h.syncWrites[0].path);
  });

  it("returns an error result when printing fails", async () => {
    h.fake.client.Page.printToPDF.mockRejectedValue(new Error("printing unavailable"));

    const result = await h.server.call("print_to_pdf");

    expect(result.isError).toBe(true);
    expect(h.syncWrites).toHaveLength(0);
  });
});

describe("get_html", () => {
  it("returns the whole document when no selector is given", async () => {
    evaluatesTo(h.fake, "<html></html>");

    expect(text(await h.server.call("get_html", {}))).toBe("<html></html>");
    expect(evaluated()).toBe("document.documentElement.outerHTML");
  });

  it("returns the innerHTML of a selected element", async () => {
    evaluatesTo(h.fake, "<span>hi</span>");

    const out = text(await h.server.call("get_html", { selector: "#main" }));

    expect(out).toBe("<span>hi</span>");
    expect(evaluated()).toContain("el.innerHTML");
    expect(evaluated()).toContain(JSON.stringify("#main"));
  });
});

describe("wait_for_element", () => {
  it("returns as soon as the element appears", async () => {
    evaluatesInOrder(h.fake, [false, false, true]);

    const out = text(await h.server.call("wait_for_element", { selector: "#late" }));

    expect(out).toContain("Element found: #late");
    expect(h.fake.client.Runtime.evaluate).toHaveBeenCalledTimes(3);
  });

  it("returns as soon as the element disappears when waiting for absence", async () => {
    evaluatesInOrder(h.fake, [true, false]);

    const out = text(await h.server.call("wait_for_element", {
      selector: "#spinner",
      visible: false,
    }));

    expect(out).toContain("Element disappeared: #spinner");
  });

  it("times out with an error result when the element never appears", async () => {
    evaluatesTo(h.fake, false);

    const result = await h.server.call("wait_for_element", {
      selector: "#never",
      timeout: 400,
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Timeout (400ms)");
    expect(text(result)).toContain("did not appear");
  });

  it("says 'did not disappear' when an absence wait times out", async () => {
    evaluatesTo(h.fake, true);

    const result = await h.server.call("wait_for_element", {
      selector: "#stuck",
      visible: false,
      timeout: 400,
    });

    expect(text(result)).toContain("did not disappear");
  });

  it("returns an error result when the page evaluation throws", async () => {
    h.fake.client.Runtime.evaluate.mockRejectedValue(new Error("detached frame"));

    const result = await h.server.call("wait_for_element", { selector: "#x", timeout: 400 });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("detached frame");
  });
});

describe("get_element_info", () => {
  it("returns the serialized element description", async () => {
    evaluatesTo(h.fake, '{"tagName":"input"}');

    expect(text(await h.server.call("get_element_info", { selector: "#email" }))).toBe(
      '{"tagName":"input"}'
    );
  });

  it("fails before evaluating when the selector matches nothing", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 0 });

    const result = await h.server.call("get_element_info", { selector: "#gone" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Element not found: #gone");
    expect(h.fake.client.Runtime.evaluate).not.toHaveBeenCalled();
  });
});
