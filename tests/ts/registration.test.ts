import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, type Harness, type ToolModule } from "./helpers/harness.js";

const ALL_MODULES: ToolModule[] = [
  "tab",
  "page",
  "interact",
  "navigate",
  "observe",
  "emulate",
  "storage",
  "dialog",
  "dom",
];

/**
 * Every tool, with arguments valid enough to reach the CDP layer. Keeping the
 * list here means a new tool that is registered but never exercised shows up as
 * a failure rather than passing unnoticed.
 */
const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  // tab
  list_tabs: {},
  get_active_tab: {},
  new_tab: {},
  close_tab: { tabId: "tab-2" },
  activate_tab: { tabId: "tab-2" },
  // page
  screenshot: {},
  get_page_text: {},
  get_dom: {},
  evaluate_js: { expression: "1" },
  full_page_screenshot: {},
  print_to_pdf: {},
  get_html: {},
  wait_for_element: { selector: "#x", timeout: 100 },
  get_element_info: { selector: "#x" },
  // interact
  click: { selector: "#x" },
  type: { selector: "#x", text: "a" },
  scroll: { direction: "down" },
  hover: { selector: "#x" },
  select_option: { selector: "#x", value: "a" },
  right_click: { selector: "#x" },
  double_click: { selector: "#x" },
  key_press: { key: "Enter" },
  clear_input: { selector: "#x" },
  set_value: { selector: "#x", value: "a" },
  check_checkbox: { selector: "#x", checked: true },
  upload_file: { selector: "#x", filePaths: ["/tmp/a"] },
  drag_and_drop: { sourceSelector: "#a", targetSelector: "#b" },
  // navigate
  navigate: { url: "https://example.com" },
  go_back: {},
  go_forward: {},
  reload: {},
  // observe
  console_messages: {},
  network_requests: {},
  // emulate
  emulate_device: { device: "Desktop" },
  set_geolocation: { latitude: 0, longitude: 0 },
  clear_geolocation: {},
  set_color_scheme: { scheme: "dark" },
  set_network_conditions: { preset: "4g" },
  override_permission: { permission: "geolocation", state: "granted" },
  set_timezone: { timezoneId: "UTC" },
  reset_emulation: {},
  // storage
  get_cookies: {},
  set_cookie: { name: "a", value: "b" },
  delete_cookie: { name: "a" },
  clear_cookies: {},
  get_local_storage: {},
  set_local_storage: { key: "k", value: "v" },
  remove_local_storage: { key: "k" },
  clear_local_storage: {},
  get_session_storage: {},
  set_session_storage: { key: "k", value: "v" },
  clear_session_storage: {},
  clear_cache: {},
  // dialog
  get_pending_dialog: {},
  handle_dialog: { accept: true },
  // dom
  get_element_attribute: { selector: "#x", attribute: "href" },
  set_element_attribute: { selector: "#x", attribute: "a", value: "b" },
  remove_element_attribute: { selector: "#x", attribute: "a" },
  get_computed_style: { selector: "#x" },
  query_elements: { selector: "#x" },
  inject_css: { css: "body{}" },
  inject_script: { code: "1" },
  get_response_body: { requestId: "req-1" },
  find_elements_with_text: { text: "hello" },
};

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(ALL_MODULES);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tool registration", () => {
  it("registers all 64 tools", () => {
    expect(h.server.names).toHaveLength(64);
  });

  it("registers exactly the documented tool set", () => {
    expect([...h.server.names].sort()).toEqual(Object.keys(TOOL_ARGS).sort());
  });

  it("gives every tool a title, a description and an input schema", () => {
    for (const [name, tool] of h.server.tools) {
      expect(tool.config.title, `${name} title`).toBeTruthy();
      expect(tool.config.description, `${name} description`).toBeTruthy();
      expect(tool.config.inputSchema, `${name} inputSchema`).toBeDefined();
    }
  });

  it("uses snake_case names throughout", () => {
    for (const name of h.server.names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("describes what each tool does in a full sentence", () => {
    for (const [name, tool] of h.server.tools) {
      expect(tool.config.description.length, `${name} description`).toBeGreaterThan(20);
      expect(tool.config.description.trim(), `${name} description`).toMatch(/\.$/);
    }
  });
});

describe("error contract", () => {
  beforeEach(async () => {
    // Connect first, then break every CDP command: the tools must translate a
    // mid-flight browser failure into an error result, never a thrown promise.
    await h.connectionManager.connect();
    for (const domainName of [
      "Page",
      "DOM",
      "Runtime",
      "Network",
      "Input",
      "Emulation",
      "Browser",
      "Accessibility",
      "Target",
    ] as const) {
      for (const method of Object.values(h.fake.client[domainName])) {
        method.mockRejectedValue(new Error("CDP command failed"));
      }
    }
  });

  it.each(Object.keys(TOOL_ARGS))("%s resolves to a result rather than throwing", async (name) => {
    const result = await h.server.call(name, TOOL_ARGS[name]);

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("stringifies a non-Error rejection instead of rendering [object Object]", async () => {
    // chrome-remote-interface rejects with plain objects for protocol errors,
    // so the handlers must cope with something that is not an Error.
    for (const domainName of ["Page", "DOM", "Runtime", "Network"] as const) {
      for (const method of Object.values(h.fake.client[domainName])) {
        method.mockRejectedValue("protocol error: target closed");
      }
    }

    for (const name of ["get_page_text", "click", "navigate", "get_cookies"]) {
      const result = await h.server.call(name, TOOL_ARGS[name]);

      expect(result.isError, name).toBe(true);
      expect(result.content[0].text, name).toBe("protocol error: target closed");
    }
  });

  it("reports an error for every tool that must reach the browser", async () => {
    // These answer from cached state or the HTTP target list, neither of which
    // goes through a CDP command, so a dead command channel is not an error.
    const cachedOnly = new Set([
      "get_pending_dialog",
      "console_messages",
      "network_requests",
      "list_tabs",
      "get_active_tab",
    ]);

    for (const [name, args] of Object.entries(TOOL_ARGS)) {
      if (cachedOnly.has(name)) continue;

      const result = await h.server.call(name, args);
      expect(result.isError, `${name} should report an error`).toBe(true);
    }
  });
});
