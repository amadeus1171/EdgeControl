# edge-control-mcp

Claude Code MCP server for Microsoft Edge browser control via the Chrome DevTools Protocol.

Connects to an existing Edge instance with remote debugging enabled. No browser extension, no Puppeteer, no Playwright — just direct CDP over a single WebSocket.

## Install

```bash
npm install -g edge-control-mcp
```

## Setup

### 1. Create the Edge Debug Shortcut

```powershell
powershell -ExecutionPolicy Bypass -File "$(npm root -g)/edge-control-mcp/scripts/create-shortcut.ps1"
```

This creates an **"Edge (Debug)"** shortcut on your Desktop that launches Edge with:
- `--remote-debugging-port=9222`
- A separate user data directory (isolated from your normal Edge)

### 2. Add to Claude Code

Add to your `.claude/.mcp.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "edge-control": {
      "command": "edge-control-mcp"
    }
  }
}
```

### 3. Usage

1. Launch Edge using the **"Edge (Debug)"** shortcut
2. Start Claude Code
3. Ask Claude to interact with your browser

## Tools

### Tab Management
- **list_tabs** — List all open tabs
- **get_active_tab** — Get info about the current tab
- **activate_tab** — Switch to a specific tab

### Page Inspection
- **screenshot** — Capture viewport as PNG
- **get_page_text** — Extract visible text
- **get_dom** — Accessibility tree snapshot
- **evaluate_js** — Run JavaScript in page context

### Interaction
- **click** — Click an element by CSS selector
- **type** — Type text into an element
- **scroll** — Scroll the page or an element
- **hover** — Hover over an element
- **select_option** — Select a dropdown value

### Navigation
- **navigate** — Go to a URL
- **go_back** — Browser back
- **go_forward** — Browser forward
- **reload** — Reload the page

### Observation
- **console_messages** — Read browser console output
- **network_requests** — Read captured network requests

## How It Works

The server connects to Edge's CDP endpoint at `localhost:9222` on the first tool call (lazy connection). It auto-detects the active tab and maintains a persistent WebSocket connection with heartbeat monitoring and automatic reconnection.

## Requirements

- Node.js >= 18
- Microsoft Edge
- Edge launched with `--remote-debugging-port=9222` (use the provided shortcut)
