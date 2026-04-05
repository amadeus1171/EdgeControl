import { connectionManager } from "./connection.js";

export async function resolveSelector(selector: string): Promise<number> {
  const client = await connectionManager.ensureConnected();
  const { DOM } = client;
  const { root } = await DOM.getDocument({ depth: 0 });
  const { nodeId } = await DOM.querySelector({
    nodeId: root.nodeId,
    selector,
  });
  if (nodeId === 0) {
    throw new Error(`Element not found: ${selector}`);
  }
  return nodeId;
}

export async function getBoxModel(
  nodeId: number
): Promise<{ x: number; y: number }> {
  const client = await connectionManager.ensureConnected();
  const { DOM } = client;
  const { model } = await DOM.getBoxModel({ nodeId });
  // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
  const quad = model.content;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  return { x, y };
}

export async function dispatchClick(x: number, y: number): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { Input } = client;
  await Input.dispatchMouseEvent({
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await Input.dispatchMouseEvent({
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

export async function dispatchHover(x: number, y: number): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { Input } = client;
  await Input.dispatchMouseEvent({
    type: "mouseMoved",
    x,
    y,
  });
}

export async function dispatchKeys(text: string): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { Input } = client;
  for (const char of text) {
    await Input.dispatchKeyEvent({ type: "keyDown", text: char });
    await Input.dispatchKeyEvent({ type: "keyUp", text: char });
  }
}

export async function dispatchEnter(): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { Input } = client;
  await Input.dispatchKeyEvent({
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await Input.dispatchKeyEvent({
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

export async function focusElement(nodeId: number): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { DOM } = client;
  await DOM.focus({ nodeId });
}

export async function scrollIntoView(nodeId: number): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { DOM } = client;
  await DOM.scrollIntoViewIfNeeded({ nodeId });
}

export async function captureScreenshot(): Promise<string> {
  const client = await connectionManager.ensureConnected();
  const { Page } = client;
  const { data } = await Page.captureScreenshot({ format: "png" });
  return data;
}

export async function evaluate(expression: string): Promise<string> {
  const client = await connectionManager.ensureConnected();
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const msg =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Unknown error";
    throw new Error(`JavaScript error: ${msg}`);
  }
  const val = result.result.value;
  if (val === undefined) {
    return result.result.description ?? "undefined";
  }
  return typeof val === "string" ? val : JSON.stringify(val, null, 2);
}

export async function getAccessibilityTree(
  depth?: number
): Promise<string> {
  const client = await connectionManager.ensureConnected();
  const { Accessibility } = client;
  const { nodes } = await Accessibility.getFullAXTree({ depth });
  const lines: string[] = [];
  for (const node of nodes) {
    const role = node.role?.value ?? "";
    const name = node.name?.value ?? "";
    if (role && role !== "none" && role !== "GenericContainer") {
      const indent = "  ".repeat(Math.min((node as any).depth ?? 0, 10));
      lines.push(`${indent}[${role}] ${name}`.trimEnd());
    }
  }
  return lines.join("\n");
}

export async function dispatchScroll(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const client = await connectionManager.ensureConnected();
  const { Input } = client;
  await Input.dispatchMouseEvent({
    type: "mouseWheel",
    x,
    y,
    deltaX,
    deltaY,
  });
}
