import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectionManager } from "../cdp/connection.js";
import {
  resolveSelector,
  getBoxModel,
  dispatchClick,
  dispatchHover,
  dispatchKeys,
  dispatchEnter,
  focusElement,
  scrollIntoView,
  dispatchScroll,
  dispatchRightClick,
  dispatchDoubleClick,
  evaluate,
} from "../cdp/wrapper.js";

export function registerInteractTools(server: McpServer): void {
  server.registerTool(
    "click",
    {
      title: "Click",
      description:
        "Click an element by CSS selector. Scrolls it into view first.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to click"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchClick(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Clicked: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "type",
    {
      title: "Type",
      description:
        "Type text into a focused element. Optionally specify a selector to focus first.",
      inputSchema: z.object({
        selector: z
          .string()
          .describe("CSS selector of the element to type into"),
        text: z.string().describe("Text to type"),
        submit: z
          .boolean()
          .optional()
          .describe("Press Enter after typing (default: false)"),
      }),
    },
    async ({ selector, text, submit }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        await focusElement(nodeId);
        await dispatchKeys(text);
        if (submit) {
          await dispatchEnter();
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Typed "${text}" into ${selector}${submit ? " and submitted" : ""}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "scroll",
    {
      title: "Scroll",
      description: "Scroll the page or a specific element.",
      inputSchema: z.object({
        direction: z
          .enum(["up", "down", "left", "right"])
          .describe("Scroll direction"),
        amount: z
          .number()
          .optional()
          .describe("Scroll amount in pixels (default: 300)"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector of element to scroll. If omitted, scrolls the viewport."),
      }),
    },
    async ({ direction, amount, selector }) => {
      try {
        await connectionManager.verifyTab();
        const pixels = amount ?? 300;
        let x = 400;
        let y = 400;

        if (selector) {
          const nodeId = await resolveSelector(selector);
          const box = await getBoxModel(nodeId);
          x = box.x;
          y = box.y;
        }

        let deltaX = 0;
        let deltaY = 0;
        switch (direction) {
          case "up":
            deltaY = -pixels;
            break;
          case "down":
            deltaY = pixels;
            break;
          case "left":
            deltaX = -pixels;
            break;
          case "right":
            deltaX = pixels;
            break;
        }

        await dispatchScroll(x, y, deltaX, deltaY);
        return {
          content: [
            {
              type: "text" as const,
              text: `Scrolled ${direction} ${pixels}px${selector ? ` on ${selector}` : ""}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "hover",
    {
      title: "Hover",
      description:
        "Hover over an element by CSS selector. Useful for tooltips and dropdowns.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to hover"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchHover(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Hovering over: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "select_option",
    {
      title: "Select Option",
      description: "Select a value in a <select> dropdown element.",
      inputSchema: z.object({
        selector: z
          .string()
          .describe("CSS selector of the <select> element"),
        value: z.string().describe("Value or visible text of the option to select"),
      }),
    },
    async ({ selector, value }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(`
          (() => {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el || el.tagName !== 'SELECT') return 'Element not found or not a <select>';
            const options = Array.from(el.options);
            const option = options.find(o => o.value === '${value.replace(/'/g, "\\'")}')
              || options.find(o => o.textContent?.trim() === '${value.replace(/'/g, "\\'")}');
            if (!option) return 'Option not found: ${value.replace(/'/g, "\\'")}';
            el.value = option.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Selected: ' + option.textContent?.trim();
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "right_click",
    {
      title: "Right Click",
      description:
        "Right-click an element by CSS selector. Scrolls it into view first.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to right-click"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchRightClick(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Right-clicked: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "double_click",
    {
      title: "Double Click",
      description:
        "Double-click an element by CSS selector. Scrolls it into view first.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to double-click"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        const nodeId = await resolveSelector(selector);
        await scrollIntoView(nodeId);
        const { x, y } = await getBoxModel(nodeId);
        await dispatchDoubleClick(x, y);
        return {
          content: [
            {
              type: "text" as const,
              text: `Double-clicked: ${selector} at (${Math.round(x)}, ${Math.round(y)})`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "key_press",
    {
      title: "Key Press",
      description:
        "Press a keyboard key or combination. Supports: Enter, Escape, Tab, Backspace, Delete, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, F1-F12, and combos like ctrl+a, ctrl+c, ctrl+v, ctrl+x, ctrl+z, ctrl+y, ctrl+shift+i.",
      inputSchema: z.object({
        key: z.string().describe("Key name or combo (e.g. 'Enter', 'Escape', 'ctrl+a', 'F5')"),
      }),
    },
    async ({ key }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const { Input } = client;

        const KEY_MAP: Record<string, { key: string; code: string; keyCode: number }> = {
          enter: { key: "Enter", code: "Enter", keyCode: 13 },
          escape: { key: "Escape", code: "Escape", keyCode: 27 },
          tab: { key: "Tab", code: "Tab", keyCode: 9 },
          backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
          delete: { key: "Delete", code: "Delete", keyCode: 46 },
          arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
          arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
          arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
          arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
          home: { key: "Home", code: "Home", keyCode: 36 },
          end: { key: "End", code: "End", keyCode: 35 },
          pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
          pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },
          space: { key: " ", code: "Space", keyCode: 32 },
          f1: { key: "F1", code: "F1", keyCode: 112 },
          f2: { key: "F2", code: "F2", keyCode: 113 },
          f3: { key: "F3", code: "F3", keyCode: 114 },
          f4: { key: "F4", code: "F4", keyCode: 115 },
          f5: { key: "F5", code: "F5", keyCode: 116 },
          f6: { key: "F6", code: "F6", keyCode: 117 },
          f7: { key: "F7", code: "F7", keyCode: 118 },
          f8: { key: "F8", code: "F8", keyCode: 119 },
          f9: { key: "F9", code: "F9", keyCode: 120 },
          f10: { key: "F10", code: "F10", keyCode: 121 },
          f11: { key: "F11", code: "F11", keyCode: 122 },
          f12: { key: "F12", code: "F12", keyCode: 123 },
        };

        const parts = key.toLowerCase().split("+");
        let modifiers = 0;
        const modifierKeys: string[] = [];
        for (const part of parts) {
          if (part === "ctrl" || part === "control") {
            modifiers |= 2;
            modifierKeys.push("Control");
          } else if (part === "alt") {
            modifiers |= 1;
            modifierKeys.push("Alt");
          } else if (part === "shift") {
            modifiers |= 8;
            modifierKeys.push("Shift");
          } else if (part === "meta" || part === "cmd") {
            modifiers |= 4;
            modifierKeys.push("Meta");
          }
        }

        const mainKey = parts[parts.length - 1];
        const mapped = KEY_MAP[mainKey];

        // Press modifier keys down
        for (const mk of modifierKeys) {
          await Input.dispatchKeyEvent({
            type: "keyDown",
            key: mk,
            code: mk + "Left",
            modifiers,
            windowsVirtualKeyCode: mk === "Control" ? 17 : mk === "Alt" ? 18 : mk === "Shift" ? 16 : 91,
            nativeVirtualKeyCode: mk === "Control" ? 17 : mk === "Alt" ? 18 : mk === "Shift" ? 16 : 91,
          });
        }

        if (mapped) {
          await Input.dispatchKeyEvent({
            type: "keyDown",
            key: mapped.key,
            code: mapped.code,
            modifiers,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
          });
          await Input.dispatchKeyEvent({
            type: "keyUp",
            key: mapped.key,
            code: mapped.code,
            modifiers,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
          });
        } else if (mainKey.length === 1) {
          const charCode = mainKey.toUpperCase().charCodeAt(0);
          await Input.dispatchKeyEvent({
            type: "keyDown",
            key: modifiers & 8 ? mainKey.toUpperCase() : mainKey,
            code: `Key${mainKey.toUpperCase()}`,
            modifiers,
            windowsVirtualKeyCode: charCode,
            nativeVirtualKeyCode: charCode,
          });
          await Input.dispatchKeyEvent({
            type: "keyUp",
            key: modifiers & 8 ? mainKey.toUpperCase() : mainKey,
            code: `Key${mainKey.toUpperCase()}`,
            modifiers,
            windowsVirtualKeyCode: charCode,
            nativeVirtualKeyCode: charCode,
          });
        } else {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Unknown key: ${mainKey}`,
              },
            ],
          };
        }

        // Release modifier keys
        for (const mk of modifierKeys.reverse()) {
          await Input.dispatchKeyEvent({
            type: "keyUp",
            key: mk,
            code: mk + "Left",
            modifiers: 0,
            windowsVirtualKeyCode: mk === "Control" ? 17 : mk === "Alt" ? 18 : mk === "Shift" ? 16 : 91,
            nativeVirtualKeyCode: mk === "Control" ? 17 : mk === "Alt" ? 18 : mk === "Shift" ? 16 : 91,
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Pressed: ${key}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "clear_input",
    {
      title: "Clear Input",
      description:
        "Clear the value of an input or textarea element.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the input to clear"),
      }),
    },
    async ({ selector }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Cleared';
          })()
        `);
        return {
          content: [
            {
              type: "text" as const,
              text: `Cleared input: ${selector}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "set_value",
    {
      title: "Set Value",
      description:
        "Directly set the value of an input, textarea, or checkbox without typing character by character.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element"),
        value: z.string().describe("Value to set (for checkboxes, use 'true' or 'false')"),
      }),
    },
    async ({ selector, value }) => {
      try {
        await connectionManager.verifyTab();
        const result = await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return 'Element not found: ${selector.replace(/'/g, "\\'")}';
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = ${JSON.stringify(value)} === 'true';
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return 'Set checked: ' + el.checked;
            }
            el.value = ${JSON.stringify(value)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Set value: ' + ${JSON.stringify(value)};
          })()
        `);
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "check_checkbox",
    {
      title: "Check Checkbox",
      description:
        "Set a checkbox or radio button to checked or unchecked.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the checkbox/radio"),
        checked: z.boolean().describe("true to check, false to uncheck"),
      }),
    },
    async ({ selector, checked }) => {
      try {
        await connectionManager.verifyTab();
        await evaluate(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('Element not found');
            el.checked = ${checked};
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()
        `);
        return {
          content: [
            {
              type: "text" as const,
              text: `Set ${selector} checked=${checked}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "upload_file",
    {
      title: "Upload File",
      description:
        "Upload files to a file input element.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the file input"),
        filePaths: z.array(z.string()).describe("Array of absolute file paths to upload"),
      }),
    },
    async ({ selector, filePaths }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const nodeId = await resolveSelector(selector);
        await (client as any).DOM.setFileInputFiles({
          nodeId,
          files: filePaths,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Uploaded ${filePaths.length} file(s) to ${selector}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "drag_and_drop",
    {
      title: "Drag and Drop",
      description:
        "Drag one element and drop it onto another element.",
      inputSchema: z.object({
        sourceSelector: z.string().describe("CSS selector of the element to drag"),
        targetSelector: z.string().describe("CSS selector of the drop target"),
      }),
    },
    async ({ sourceSelector, targetSelector }) => {
      try {
        await connectionManager.verifyTab();
        const client = await connectionManager.ensureConnected();
        const { Input } = client;
        const sourceNodeId = await resolveSelector(sourceSelector);
        const targetNodeId = await resolveSelector(targetSelector);
        await scrollIntoView(sourceNodeId);
        const source = await getBoxModel(sourceNodeId);
        await scrollIntoView(targetNodeId);
        const target = await getBoxModel(targetNodeId);

        // Mouse-based drag
        await Input.dispatchMouseEvent({
          type: "mousePressed",
          x: source.x,
          y: source.y,
          button: "left",
          clickCount: 1,
        });
        // Move in steps for smoother drag
        const steps = 5;
        for (let i = 1; i <= steps; i++) {
          await Input.dispatchMouseEvent({
            type: "mouseMoved",
            x: source.x + ((target.x - source.x) * i) / steps,
            y: source.y + ((target.y - source.y) * i) / steps,
            button: "left",
          });
        }
        await Input.dispatchMouseEvent({
          type: "mouseReleased",
          x: target.x,
          y: target.y,
          button: "left",
          clickCount: 1,
        });

        // Also dispatch HTML5 drag events as fallback
        await evaluate(`
          (() => {
            const src = document.querySelector(${JSON.stringify(sourceSelector)});
            const tgt = document.querySelector(${JSON.stringify(targetSelector)});
            if (!src || !tgt) return;
            const dataTransfer = new DataTransfer();
            src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
            tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
            tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
            src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
          })()
        `);

        return {
          content: [
            {
              type: "text" as const,
              text: `Dragged ${sourceSelector} to ${targetSelector}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );
}
