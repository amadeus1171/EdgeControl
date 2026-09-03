import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveSelector", () => {
  it("queries from the document root and returns the node id", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 77 });

    const nodeId = await h.wrapper.resolveSelector("#login");

    expect(h.fake.client.DOM.getDocument).toHaveBeenCalledWith({ depth: 0 });
    expect(h.fake.client.DOM.querySelector).toHaveBeenCalledWith({
      nodeId: 1,
      selector: "#login",
    });
    expect(nodeId).toBe(77);
  });

  it("throws a selector-specific error when CDP reports node 0", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 0 });

    await expect(h.wrapper.resolveSelector("#missing")).rejects.toThrow(
      "Element not found: #missing"
    );
  });
});

describe("getBoxModel", () => {
  it("averages the content quad into a centre point", async () => {
    // 20x10 box at the origin.
    h.fake.client.DOM.getBoxModel.mockResolvedValue({
      model: { content: [0, 0, 20, 0, 20, 10, 0, 10] },
    });

    expect(await h.wrapper.getBoxModel(1)).toEqual({ x: 10, y: 5 });
  });

  it("handles a box offset from the origin", async () => {
    // 100x50 box with its top-left at (100, 200).
    h.fake.client.DOM.getBoxModel.mockResolvedValue({
      model: { content: [100, 200, 200, 200, 200, 250, 100, 250] },
    });

    expect(await h.wrapper.getBoxModel(1)).toEqual({ x: 150, y: 225 });
  });
});

describe("mouse dispatch", () => {
  it("sends a press/release pair for a left click", async () => {
    await h.wrapper.dispatchClick(10, 20);

    const calls = h.fake.client.Input.dispatchMouseEvent.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      { type: "mousePressed", x: 10, y: 20, button: "left", clickCount: 1 },
      { type: "mouseReleased", x: 10, y: 20, button: "left", clickCount: 1 },
    ]);
  });

  it("sends a press/release pair with the right button for a right click", async () => {
    await h.wrapper.dispatchRightClick(5, 6);

    const calls = h.fake.client.Input.dispatchMouseEvent.mock.calls.map((c) => c[0]);
    expect(calls.every((c) => c.button === "right")).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("escalates clickCount to 2 on the second press of a double click", async () => {
    await h.wrapper.dispatchDoubleClick(1, 2);

    const calls = h.fake.client.Input.dispatchMouseEvent.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.clickCount)).toEqual([1, 1, 2, 2]);
  });

  it("sends a move-only event for a hover", async () => {
    await h.wrapper.dispatchHover(3, 4);

    expect(h.fake.client.Input.dispatchMouseEvent).toHaveBeenCalledExactlyOnceWith({
      type: "mouseMoved",
      x: 3,
      y: 4,
    });
  });

  it("sends a wheel event carrying the deltas for a scroll", async () => {
    await h.wrapper.dispatchScroll(100, 200, 0, -300);

    expect(h.fake.client.Input.dispatchMouseEvent).toHaveBeenCalledExactlyOnceWith({
      type: "mouseWheel",
      x: 100,
      y: 200,
      deltaX: 0,
      deltaY: -300,
    });
  });
});

describe("keyboard dispatch", () => {
  it("sends a down/up pair per character, in order", async () => {
    await h.wrapper.dispatchKeys("hi");

    const calls = h.fake.client.Input.dispatchKeyEvent.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      { type: "keyDown", text: "h" },
      { type: "keyUp", text: "h" },
      { type: "keyDown", text: "i" },
      { type: "keyUp", text: "i" },
    ]);
  });

  it("types nothing for an empty string", async () => {
    await h.wrapper.dispatchKeys("");

    expect(h.fake.client.Input.dispatchKeyEvent).not.toHaveBeenCalled();
  });

  it("sends Enter with the virtual key codes a page needs to see it", async () => {
    await h.wrapper.dispatchEnter();

    const calls = h.fake.client.Input.dispatchKeyEvent.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    expect(calls[1]).toMatchObject({ type: "keyUp", key: "Enter" });
  });
});

describe("evaluate", () => {
  it("returns a string result unchanged", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({ result: { value: "hello" } });

    expect(await h.wrapper.evaluate("'hello'")).toBe("hello");
  });

  it("evaluates with returnByValue and awaitPromise so async code resolves", async () => {
    await h.wrapper.evaluate("fetch('/x')");

    expect(h.fake.client.Runtime.evaluate).toHaveBeenCalledWith({
      expression: "fetch('/x')",
      returnByValue: true,
      awaitPromise: true,
    });
  });

  it("pretty-prints a non-string result as JSON", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: { value: { a: 1, b: [2] } },
    });

    expect(await h.wrapper.evaluate("x")).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2));
  });

  it("stringifies a boolean result, so callers can compare it as text", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({ result: { value: true } });

    expect(await h.wrapper.evaluate("x")).toBe("true");
  });

  it("falls back to the description when the value is undefined", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: { value: undefined, description: "undefined" },
    });

    expect(await h.wrapper.evaluate("void 0")).toBe("undefined");
  });

  it("reports the exception description when page code throws", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: {
        text: "Uncaught",
        exception: { description: "TypeError: x is not a function" },
      },
    });

    await expect(h.wrapper.evaluate("x()")).rejects.toThrow(
      "JavaScript error: TypeError: x is not a function"
    );
  });

  it("falls back to the exception text when there is no description", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { text: "Uncaught SyntaxError" },
    });

    await expect(h.wrapper.evaluate("(")).rejects.toThrow(
      "JavaScript error: Uncaught SyntaxError"
    );
  });
});

describe("getAccessibilityTree", () => {
  it("renders role and name, indented by depth", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({
      nodes: [
        { role: { value: "WebArea" }, name: { value: "Example" }, depth: 0 },
        { role: { value: "button" }, name: { value: "Submit" }, depth: 1 },
      ],
    });

    expect(await h.wrapper.getAccessibilityTree()).toBe("[WebArea] Example\n  [button] Submit");
  });

  it("drops structural nodes that carry no semantics", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({
      nodes: [
        { role: { value: "none" }, name: { value: "ignored" } },
        { role: { value: "GenericContainer" }, name: { value: "ignored" } },
        { role: { value: "link" }, name: { value: "Home" } },
        { name: { value: "no role at all" } },
      ],
    });

    expect(await h.wrapper.getAccessibilityTree()).toBe("[link] Home");
  });

  it("trims the trailing space on a node with no accessible name", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({
      nodes: [{ role: { value: "separator" } }],
    });

    expect(await h.wrapper.getAccessibilityTree()).toBe("[separator]");
  });

  it("caps indentation so a deep tree stays readable", async () => {
    h.fake.client.Accessibility.getFullAXTree.mockResolvedValue({
      nodes: [{ role: { value: "text" }, name: { value: "deep" }, depth: 99 }],
    });

    // 10 levels of two-space indent, not 99.
    expect(await h.wrapper.getAccessibilityTree()).toBe(`${"  ".repeat(10)}[text] deep`);
  });

  it("passes the depth limit through to CDP", async () => {
    await h.wrapper.getAccessibilityTree(3);

    expect(h.fake.client.Accessibility.getFullAXTree).toHaveBeenCalledWith({ depth: 3 });
  });
});

describe("element helpers", () => {
  it("focuses by node id", async () => {
    await h.wrapper.focusElement(9);

    expect(h.fake.client.DOM.focus).toHaveBeenCalledWith({ nodeId: 9 });
  });

  it("scrolls into view by node id", async () => {
    await h.wrapper.scrollIntoView(9);

    expect(h.fake.client.DOM.scrollIntoViewIfNeeded).toHaveBeenCalledWith({ nodeId: 9 });
  });

  it("captures a png screenshot and returns its base64 payload", async () => {
    h.fake.client.Page.captureScreenshot.mockResolvedValue({ data: "QUJD" });

    expect(await h.wrapper.captureScreenshot()).toBe("QUJD");
    expect(h.fake.client.Page.captureScreenshot).toHaveBeenCalledWith({ format: "png" });
  });
});
