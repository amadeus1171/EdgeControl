import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";
import { evaluatesTo } from "./helpers/fake-cdp.js";

let h: Harness;

function mouseEvents(): any[] {
  return h.fake.client.Input.dispatchMouseEvent.mock.calls.map((c) => c[0]);
}

function keyEvents(): any[] {
  return h.fake.client.Input.dispatchKeyEvent.mock.calls.map((c) => c[0]);
}

function evaluated(index = 0): string {
  return h.fake.client.Runtime.evaluate.mock.calls[index][0].expression;
}

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["interact"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("click", () => {
  it("scrolls into view, then clicks the centre of the element", async () => {
    const out = text(await h.server.call("click", { selector: "#submit" }));

    expect(h.fake.client.DOM.scrollIntoViewIfNeeded).toHaveBeenCalledWith({ nodeId: 42 });
    // Default fake box is 20x10 at the origin.
    expect(mouseEvents()).toEqual([
      { type: "mousePressed", x: 10, y: 5, button: "left", clickCount: 1 },
      { type: "mouseReleased", x: 10, y: 5, button: "left", clickCount: 1 },
    ]);
    expect(out).toBe("Clicked: #submit at (10, 5)");
  });

  it("scrolls before measuring, so the coordinates are post-scroll", async () => {
    await h.server.call("click", { selector: "#submit" });

    expect(h.fake.callLog.indexOf("DOM.scrollIntoViewIfNeeded")).toBeLessThan(
      h.fake.callLog.indexOf("DOM.getBoxModel")
    );
  });

  it("rounds the reported coordinates", async () => {
    h.fake.client.DOM.getBoxModel.mockResolvedValue({
      model: { content: [0, 0, 15, 0, 15, 7, 0, 7] },
    });

    // Centre is (7.5, 3.5) -> reported as (8, 4).
    expect(text(await h.server.call("click", { selector: "#x" }))).toBe("Clicked: #x at (8, 4)");
  });

  it("returns an error result and dispatches nothing when the selector misses", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 0 });

    const result = await h.server.call("click", { selector: "#gone" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Element not found: #gone");
    expect(h.fake.client.Input.dispatchMouseEvent).not.toHaveBeenCalled();
  });

  it("returns an error result when the element has no box (display:none)", async () => {
    h.fake.client.DOM.getBoxModel.mockRejectedValue(new Error("Could not compute box model."));

    const result = await h.server.call("click", { selector: "#hidden" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Could not compute box model.");
  });
});

describe("type", () => {
  it("focuses the element then types each character", async () => {
    const out = text(await h.server.call("type", { selector: "#email", text: "hi" }));

    expect(h.fake.client.DOM.focus).toHaveBeenCalledWith({ nodeId: 42 });
    expect(keyEvents()).toHaveLength(4);
    expect(out).toBe('Typed "hi" into #email');
  });

  it("presses Enter when asked to submit", async () => {
    const out = text(await h.server.call("type", {
      selector: "#q",
      text: "a",
      submit: true,
    }));

    const events = keyEvents();
    expect(events.at(-1)).toMatchObject({ type: "keyUp", key: "Enter" });
    expect(out).toBe('Typed "a" into #q and submitted');
  });

  it("does not press Enter by default", async () => {
    await h.server.call("type", { selector: "#q", text: "a" });

    expect(keyEvents().some((e) => e.key === "Enter")).toBe(false);
  });
});

describe("scroll", () => {
  it("scrolls the viewport down by 300px by default", async () => {
    const out = text(await h.server.call("scroll", { direction: "down" }));

    expect(mouseEvents()).toEqual([
      { type: "mouseWheel", x: 400, y: 400, deltaX: 0, deltaY: 300 },
    ]);
    expect(out).toBe("Scrolled down 300px");
  });

  it.each([
    ["up", { deltaX: 0, deltaY: -100 }],
    ["down", { deltaX: 0, deltaY: 100 }],
    ["left", { deltaX: -100, deltaY: 0 }],
    ["right", { deltaX: 100, deltaY: 0 }],
  ])("maps %s to the right deltas", async (direction, deltas) => {
    await h.server.call("scroll", { direction, amount: 100 });

    expect(mouseEvents()[0]).toMatchObject(deltas);
  });

  it("scrolls at the element's centre when a selector is given", async () => {
    const out = text(await h.server.call("scroll", {
      direction: "down",
      selector: "#panel",
    }));

    expect(mouseEvents()[0]).toMatchObject({ x: 10, y: 5 });
    expect(out).toBe("Scrolled down 300px on #panel");
  });

  it("returns an error result when the target element is missing", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 0 });

    const result = await h.server.call("scroll", { direction: "down", selector: "#gone" });

    expect(result.isError).toBe(true);
  });
});

describe("hover", () => {
  it("moves the mouse to the element centre without pressing", async () => {
    const out = text(await h.server.call("hover", { selector: "#menu" }));

    expect(mouseEvents()).toEqual([{ type: "mouseMoved", x: 10, y: 5 }]);
    expect(out).toBe("Hovering over: #menu at (10, 5)");
  });
});

describe("right_click and double_click", () => {
  it("dispatches a right-button press and release", async () => {
    const out = text(await h.server.call("right_click", { selector: "#ctx" }));

    expect(mouseEvents().every((e) => e.button === "right")).toBe(true);
    expect(out).toBe("Right-clicked: #ctx at (10, 5)");
  });

  it("dispatches two clicks with an escalating click count", async () => {
    const out = text(await h.server.call("double_click", { selector: "#word" }));

    expect(mouseEvents().map((e) => e.clickCount)).toEqual([1, 1, 2, 2]);
    expect(out).toBe("Double-clicked: #word at (10, 5)");
  });
});

describe("select_option", () => {
  it("returns whatever the page reported", async () => {
    evaluatesTo(h.fake, "Selected: United Kingdom");

    const out = text(await h.server.call("select_option", {
      selector: "#country",
      value: "uk",
    }));

    expect(out).toBe("Selected: United Kingdom");
  });

  it("matches by value first, then by visible text", async () => {
    await h.server.call("select_option", { selector: "#country", value: "uk" });

    const expression = evaluated();
    expect(expression.indexOf("o.value ===")).toBeLessThan(
      expression.indexOf("o.textContent?.trim() ===")
    );
  });

  it("escapes single quotes in the selector and value", async () => {
    await h.server.call("select_option", { selector: "#it's", value: "o'brien" });

    const expression = evaluated();
    expect(expression).toContain("#it\\'s");
    expect(expression).toContain("o\\'brien");
  });

  it("reports the page's message when the element is not a select", async () => {
    evaluatesTo(h.fake, "Element not found or not a <select>");

    expect(text(await h.server.call("select_option", { selector: "#div", value: "x" }))).toBe(
      "Element not found or not a <select>"
    );
  });
});

describe("key_press", () => {
  it("sends a named key with its virtual key code", async () => {
    const out = text(await h.server.call("key_press", { key: "Escape" }));

    expect(keyEvents()).toEqual([
      expect.objectContaining({ type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 }),
      expect.objectContaining({ type: "keyUp", key: "Escape" }),
    ]);
    expect(out).toBe("Pressed: Escape");
  });

  it("accepts a key name in any case", async () => {
    await h.server.call("key_press", { key: "ESCAPE" });

    expect(keyEvents()[0]).toMatchObject({ key: "Escape" });
  });

  it("wraps a combo's main key in modifier down/up events", async () => {
    await h.server.call("key_press", { key: "ctrl+a" });

    const events = keyEvents();
    expect(events[0]).toMatchObject({ type: "keyDown", key: "Control" });
    expect(events[1]).toMatchObject({ type: "keyDown", key: "a", modifiers: 2 });
    expect(events[2]).toMatchObject({ type: "keyUp", key: "a" });
    expect(events[3]).toMatchObject({ type: "keyUp", key: "Control" });
  });

  it("combines modifier bits for a multi-modifier combo", async () => {
    await h.server.call("key_press", { key: "ctrl+shift+i" });

    // Control (2) | Shift (8) = 10.
    const main = keyEvents().find((e) => e.code === "KeyI");
    expect(main.modifiers).toBe(10);
  });

  it("upper-cases the character when shift is held", async () => {
    await h.server.call("key_press", { key: "shift+a" });

    expect(keyEvents().find((e) => e.code === "KeyA").key).toBe("A");
  });

  it("releases modifiers in reverse order", async () => {
    await h.server.call("key_press", { key: "ctrl+alt+delete" });

    const ups = keyEvents().filter((e) => e.type === "keyUp").map((e) => e.key);
    expect(ups).toEqual(["Delete", "Alt", "Control"]);
  });

  it("accepts 'control' and 'cmd' as modifier spellings", async () => {
    await h.server.call("key_press", { key: "control+c" });
    expect(keyEvents()[0]).toMatchObject({ key: "Control" });

    h.fake.client.Input.dispatchKeyEvent.mockClear();

    await h.server.call("key_press", { key: "cmd+c" });
    expect(keyEvents()[0]).toMatchObject({ key: "Meta" });
  });

  it("sends a single character key with its char code", async () => {
    await h.server.call("key_press", { key: "z" });

    expect(keyEvents()[0]).toMatchObject({
      key: "z",
      code: "KeyZ",
      windowsVirtualKeyCode: "Z".charCodeAt(0),
    });
  });

  it("rejects an unknown multi-character key name", async () => {
    const result = await h.server.call("key_press", { key: "Frobnicate" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Unknown key: frobnicate");
  });

  it("supports function keys", async () => {
    await h.server.call("key_press", { key: "F5" });

    expect(keyEvents()[0]).toMatchObject({ key: "F5", windowsVirtualKeyCode: 116 });
  });
});

describe("clear_input", () => {
  it("clears the value and fires input and change events", async () => {
    const out = text(await h.server.call("clear_input", { selector: "#name" }));

    const expression = evaluated();
    expect(expression).toContain("el.value = ''");
    expect(expression).toContain("new Event('input'");
    expect(expression).toContain("new Event('change'");
    expect(out).toBe("Cleared input: #name");
  });

  it("returns an error result when the element is missing", async () => {
    h.fake.client.Runtime.evaluate.mockResolvedValue({
      result: {},
      exceptionDetails: { exception: { description: "Error: Element not found: #gone" } },
    });

    const result = await h.server.call("clear_input", { selector: "#gone" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Element not found: #gone");
  });
});

describe("set_value", () => {
  it("returns the page's confirmation for a text input", async () => {
    evaluatesTo(h.fake, "Set value: hello");

    expect(text(await h.server.call("set_value", { selector: "#n", value: "hello" }))).toBe(
      "Set value: hello"
    );
  });

  it("treats the string 'true' as checked for a checkbox", async () => {
    await h.server.call("set_value", { selector: "#agree", value: "true" });

    expect(evaluated()).toContain(`${JSON.stringify("true")} === 'true'`);
  });

  it("JSON-encodes the value so quotes cannot break the expression", async () => {
    await h.server.call("set_value", { selector: "#n", value: 'a"b' });

    expect(evaluated()).toContain(JSON.stringify('a"b'));
  });
});

describe("check_checkbox", () => {
  it("sets checked and fires a change event", async () => {
    const out = text(await h.server.call("check_checkbox", {
      selector: "#agree",
      checked: true,
    }));

    expect(evaluated()).toContain("el.checked = true;");
    expect(evaluated()).toContain("new Event('change'");
    expect(out).toBe("Set #agree checked=true");
  });

  it("unchecks", async () => {
    const out = text(await h.server.call("check_checkbox", {
      selector: "#agree",
      checked: false,
    }));

    expect(evaluated()).toContain("el.checked = false;");
    expect(out).toBe("Set #agree checked=false");
  });
});

describe("upload_file", () => {
  it("sets the files on the resolved input node", async () => {
    const files = ["C:\\tmp\\a.png", "C:\\tmp\\b.png"];

    const out = text(await h.server.call("upload_file", {
      selector: "input[type=file]",
      filePaths: files,
    }));

    expect(h.fake.client.DOM.setFileInputFiles).toHaveBeenCalledWith({
      nodeId: 42,
      files,
    });
    expect(out).toBe("Uploaded 2 file(s) to input[type=file]");
  });

  it("returns an error result when the input cannot be found", async () => {
    h.fake.client.DOM.querySelector.mockResolvedValue({ nodeId: 0 });

    const result = await h.server.call("upload_file", {
      selector: "#nope",
      filePaths: ["/tmp/a"],
    });

    expect(result.isError).toBe(true);
    expect(h.fake.client.DOM.setFileInputFiles).not.toHaveBeenCalled();
  });
});

describe("drag_and_drop", () => {
  it("presses on the source, moves in steps, and releases on the target", async () => {
    h.fake.client.DOM.getBoxModel
      .mockResolvedValueOnce({ model: { content: [0, 0, 20, 0, 20, 10, 0, 10] } })
      .mockResolvedValueOnce({ model: { content: [100, 100, 120, 100, 120, 110, 100, 110] } });

    const out = text(await h.server.call("drag_and_drop", {
      sourceSelector: "#a",
      targetSelector: "#b",
    }));

    const events = mouseEvents();
    expect(events[0]).toMatchObject({ type: "mousePressed", x: 10, y: 5 });

    const moves = events.filter((e) => e.type === "mouseMoved");
    expect(moves).toHaveLength(5);
    // Interpolated from source centre (10,5) to target centre (110,105).
    expect(moves.at(-1)).toMatchObject({ x: 110, y: 105 });

    expect(events.at(-1)).toMatchObject({ type: "mouseReleased", x: 110, y: 105 });
    expect(out).toBe("Dragged #a to #b");
  });

  it("also fires HTML5 drag events, for pages that ignore raw mouse input", async () => {
    await h.server.call("drag_and_drop", { sourceSelector: "#a", targetSelector: "#b" });

    const expression = evaluated();
    for (const event of ["dragstart", "dragover", "drop", "dragend"]) {
      expect(expression).toContain(event);
    }
  });

  it("returns an error result when the drop target is missing", async () => {
    h.fake.client.DOM.querySelector
      .mockResolvedValueOnce({ nodeId: 42 })
      .mockResolvedValueOnce({ nodeId: 0 });

    const result = await h.server.call("drag_and_drop", {
      sourceSelector: "#a",
      targetSelector: "#gone",
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Element not found: #gone");
    expect(h.fake.client.Input.dispatchMouseEvent).not.toHaveBeenCalled();
  });
});
