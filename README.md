# edge-control-mcp

Claude Code MCP server for Microsoft Edge browser control via the Chrome DevTools Protocol.

Connects to an existing Edge instance with remote debugging enabled. No browser extension, no Puppeteer, no Playwright — just direct CDP over a single WebSocket.

64 tools across tab management, navigation, page inspection, interaction, DOM manipulation, observation, storage, device emulation, and dialog handling. Includes an optional Claude Code hook that passively injects the open tab list into every prompt.

## Install

### Option A — from npm (global)

> **Not published to npm yet.** This option will work once the package is
> released. For now, install from source (Option B).

```bash
npm install -g edge-control-mcp
```

### Option B — from source

```bash
git clone https://github.com/amadeus1171/EdgeControl.git
cd EdgeControl
npm install
npm run build
```

This compiles TypeScript into `dist/`. The MCP server entry point is `dist/index.js`.

## Setup

### 1. Create the Edge Debug Shortcut

From an npm global install:

```powershell
powershell -ExecutionPolicy Bypass -File "$(npm root -g)/edge-control-mcp/scripts/create-shortcut.ps1"
```

From a source checkout:

```powershell
powershell -ExecutionPolicy Bypass -File "scripts/create-shortcut.ps1"
```

This creates an **"Edge (Debug)"** shortcut on your Desktop that launches Edge with:
- `--remote-debugging-port=9222`
- A separate user data directory (isolated from your normal Edge)

The Chrome DevTools Protocol also works with Google Chrome. To control Chrome
instead, run `scripts/create-chrome-shortcut.ps1` — it creates an equivalent
**"Chrome (Debug)"** shortcut on the same debug port.

### 2. Add to Claude Code

Add to your `.claude/.mcp.json` (create if it doesn't exist).

**From an npm global install** — use the installed `edge-control-mcp` binary:

```json
{
  "mcpServers": {
    "edge-control": {
      "command": "edge-control-mcp"
    }
  }
}
```

**From a source checkout** — point Node at the built entry point (use the absolute path to your clone):

```json
{
  "mcpServers": {
    "edge-control": {
      "command": "node",
      "args": ["C:/path/to/EdgeControl/dist/index.js"]
    }
  }
}
```

After pulling new changes in a source checkout, re-run `npm run build` so `dist/` is up to date. Use `npm run dev` to rebuild automatically on save.

### 3. Usage

1. Launch Edge using the **"Edge (Debug)"** shortcut
2. Start Claude Code
3. Ask Claude to interact with your browser

## Tools

### Tab Management
- **list_tabs** — List all open tabs. Returns tab ID, title, and URL for each.
- **get_active_tab** — Get info about the currently attached tab (title, URL, tab ID).
- **new_tab** — Open a new browser tab, optionally navigating to a URL.
- **close_tab** — Close a tab by its ID.
- **activate_tab** — Switch to a specific tab by its ID.

### Navigation
- **navigate** — Go to a URL in the current tab.
- **go_back** — Navigate back in browser history.
- **go_forward** — Navigate forward in browser history.
- **reload** — Reload the current page.

### Page Inspection
- **screenshot** — Capture the current viewport as a base64 PNG.
- **full_page_screenshot** — Capture the entire page (beyond the viewport) as a base64 PNG.
- **print_to_pdf** — Print the current page to a PDF file; returns the saved file path.
- **get_page_text** — Extract all visible text content from the page.
- **get_html** — Get the HTML source of the page or a specific element.
- **get_dom** — Accessibility tree snapshot showing element roles, names, and structure.
- **get_element_info** — Detailed info about an element: tag, attributes, text, value, computed styles.
- **evaluate_js** — Run JavaScript in the page context and return the result.
- **wait_for_element** — Wait for an element to appear or disappear from the page.

### Interaction
- **click** — Click an element by CSS selector (scrolls it into view first).
- **right_click** — Right-click an element by CSS selector.
- **double_click** — Double-click an element by CSS selector.
- **hover** — Hover over an element (useful for tooltips and dropdowns).
- **type** — Type text into a focused element, optionally focusing a selector first.
- **key_press** — Press a key or combination (Enter, Escape, Tab, arrows, F1–F12, `ctrl+a`, `ctrl+c`, etc.).
- **scroll** — Scroll the page or a specific element.
- **select_option** — Select a value in a `<select>` dropdown.
- **clear_input** — Clear the value of an input or textarea.
- **set_value** — Directly set an input/textarea/checkbox value without typing character by character.
- **check_checkbox** — Set a checkbox or radio button to checked or unchecked.
- **upload_file** — Upload files to a file input element.
- **drag_and_drop** — Drag one element and drop it onto another.

### DOM & Resources
- **query_elements** — Query all elements matching a CSS selector (tag, text, attributes, value; max 50).
- **find_elements_with_text** — Find elements containing specific text, optionally limited to a tag.
- **get_element_attribute** — Read an attribute value on an element.
- **set_element_attribute** — Set an attribute value on an element.
- **remove_element_attribute** — Remove an attribute from an element.
- **get_computed_style** — Get computed CSS styles of an element.
- **inject_css** — Inject CSS styles into the current page.
- **inject_script** — Inject a script into the page (external URL or inline code).
- **get_response_body** — Get the response body of a network request by request ID or URL pattern.

### Observation
- **console_messages** — Read captured console output (log, warn, error) since the tab was attached.
- **network_requests** — Read captured network requests since the tab was attached.

### Storage
- **get_cookies** — Get cookies for the current page or a specific URL.
- **set_cookie** — Set a browser cookie.
- **delete_cookie** — Delete a cookie by name.
- **clear_cookies** — Clear all browser cookies.
- **get_local_storage** — Get all localStorage entries for the current page.
- **set_local_storage** — Set a localStorage entry.
- **remove_local_storage** — Remove a localStorage entry by key.
- **clear_local_storage** — Clear all localStorage entries.
- **get_session_storage** — Get all sessionStorage entries for the current page.
- **set_session_storage** — Set a sessionStorage entry.
- **clear_session_storage** — Clear all sessionStorage entries.
- **clear_cache** — Clear the browser disk cache.

### Emulation
- **emulate_device** — Emulate a device viewport, user agent, and touch. Devices: iPhone SE, iPhone 14, iPhone 14 Pro Max, iPad, iPad Pro, Pixel 7, Samsung Galaxy S21, Laptop, Desktop, Desktop 4K. Use `reset` to clear.
- **set_color_scheme** — Emulate a preferred color scheme (`light` / `dark`).
- **set_network_conditions** — Emulate network conditions (`online`, `offline`, `slow-3g`, `fast-3g`, `4g`).
- **set_geolocation** — Override the browser's geolocation.
- **clear_geolocation** — Clear the geolocation override.
- **set_timezone** — Override the browser timezone (e.g. `America/Los_Angeles`, `Europe/London`, `UTC`).
- **override_permission** — Override a browser permission (geolocation, notifications, camera, microphone).
- **reset_emulation** — Reset all emulation overrides: device metrics, user agent, touch, geolocation, color scheme, network conditions, and timezone.

### Dialogs
- **get_pending_dialog** — Check whether a JavaScript dialog (alert/confirm/prompt) is pending; returns its type and message.
- **handle_dialog** — Accept or dismiss a pending JavaScript dialog.

## Tab Context Hook (optional)

EdgeControl ships with a Claude Code `UserPromptSubmit` hook that passively injects the open Edge tab list into every prompt, so Claude knows what's open in the browser without calling `list_tabs` or `get_active_tab`.

**How it works:** the MCP server writes `state.json` to the project root whenever it attaches to a tab. The hook script (`hook/tab_context.py`) reads `state.json` for the active tab and queries `localhost:9222/json` for the full tab list, then prints an `[EDGE BROWSER]` block. If `state.json` is missing, it lists all tabs without marking one active; if Edge is not running, it stays silent.

**Register it** by adding this entry to `~/.claude/settings.json` under `UserPromptSubmit`:

```json
{
  "type": "command",
  "command": "python C:/path/to/EdgeControl/hook/tab_context.py"
}
```

The hook makes a single HTTP GET to the CDP endpoint and completes in well under 100ms. It exits 0 silently on any failure, so it never blocks a prompt. Requires Python 3.

## How It Works

The server connects to Edge's CDP endpoint at `localhost:9222` on the first tool call (lazy connection). It auto-detects the active tab and maintains a persistent WebSocket connection with heartbeat monitoring and automatic reconnection.

## Development

```bash
npm install
npm run build          # compile to dist/
npm run typecheck      # type-check src and tests, no emit
npm test               # TypeScript unit tests (vitest)
npm run test:watch     # the same, in watch mode
npm run test:coverage  # with a coverage report; 80% minimum on every metric
npm run test:hook      # Python tests for the tab context hook (needs pytest)
```

### Tests

`tests/ts/` covers the TypeScript server and `tests/test_tab_context.py` covers
the Python hook.

The tests run against a fake `chrome-remote-interface` rather than a live
browser, so no Edge instance is needed and the suite runs in a few seconds.
`tests/ts/helpers/fake-cdp.ts` stands in for the CDP client, and
`tests/ts/helpers/harness.ts` captures what each module registers so a tool
handler can be invoked directly. Everything between the tool boundary and that
seam — selector resolution, coordinate math, CDP call sequencing, output
formatting, error handling — runs for real.

Because the connection manager is a module-level singleton holding a live
client and timers, each test loads a fresh copy via `loadHarness()`; do not
hoist it into a shared fixture.

## Requirements

- Node.js >= 18
- Microsoft Edge
- Edge launched with `--remote-debugging-port=9222` (use the provided shortcut)
- Python 3 (only for the optional tab context hook)
</content>
</invoke>
