import CDP from "chrome-remote-interface";
import type { Client } from "chrome-remote-interface";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../state.json");

const CDP_PORT = 9222;
const CDP_HOST = "127.0.0.1";
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_MS = 500;

interface TabInfo {
  id: string;
  title: string;
  url: string;
}

class ConnectionManager {
  private client: Client | null = null;
  private currentTabId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingDialog: { type: string; message: string; defaultPrompt?: string } | null = null;
  private consoleMessages: Array<{ level: string; text: string; timestamp: number }> = [];
  private networkRequests: Array<{
    requestId: string;
    url: string;
    method: string;
    status?: number;
    size?: number;
  }> = [];

  async ensureConnected(): Promise<Client> {
    if (this.client) {
      return this.client;
    }
    return this.connect();
  }

  async connect(): Promise<Client> {
    let targets: CDP.Target[];
    try {
      targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
    } catch {
      throw new Error(
        "Cannot connect to Edge. Launch the Edge (Debug) shortcut first."
      );
    }

    const pageTargets = targets.filter((t) => t.type === "page");
    if (pageTargets.length === 0) {
      throw new Error("No open tabs found in the Edge debug instance.");
    }

    const target = pageTargets[0];
    this.client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });
    this.currentTabId = target.id;
    this.writeStateFile({ id: target.id, title: target.title ?? "", url: target.url ?? "" });

    await this.enableDomains();
    this.setupDisconnectHandler();
    this.startHeartbeat();

    return this.client;
  }

  private async enableDomains(): Promise<void> {
    if (!this.client) return;
    const { Page, Console, Network, Runtime, DOM } = this.client;
    await Page.enable();
    await DOM.enable();
    await Runtime.enable();
    await Console.enable();
    await Network.enable();

    this.consoleMessages = [];
    this.networkRequests = [];
    this.pendingDialog = null;

    Page.javascriptDialogOpening((params: { type: string; message: string; defaultPrompt?: string }) => {
      this.pendingDialog = { type: params.type, message: params.message, defaultPrompt: params.defaultPrompt };
    });

    Runtime.consoleAPICalled((params) => {
      const text = params.args
        .map((a: { value?: string; description?: string }) => a.value ?? a.description ?? "")
        .join(" ");
      this.consoleMessages.push({
        level: params.type,
        text,
        timestamp: params.timestamp,
      });
    });

    Network.requestWillBeSent((params) => {
      this.networkRequests.push({
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
      });
    });

    Network.responseReceived((params) => {
      const entry = this.networkRequests.find((r) => r.requestId === params.requestId);
      if (entry) {
        entry.status = params.response.status;
      }
    });

    Network.loadingFinished((params) => {
      const entry = this.networkRequests.find((r) => r.requestId === params.requestId);
      if (entry) {
        entry.size = params.encodedDataLength;
      }
    });
  }

  private setupDisconnectHandler(): void {
    if (!this.client) return;
    this.client.on("disconnect", () => {
      this.cleanup();
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      try {
        if (this.client) {
          await (this.client as any).Target.getTargets();
        }
      } catch {
        this.cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    this.client = null;
    this.currentTabId = null;
  }

  async reconnect(): Promise<Client> {
    this.cleanup();
    let delay = RECONNECT_BASE_MS;
    for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        return await this.connect();
      } catch {
        if (attempt < MAX_RECONNECT_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
    throw new Error(
      "Cannot connect to Edge. Launch the Edge (Debug) shortcut first."
    );
  }

  async verifyTab(): Promise<{ reattached: boolean; message?: string }> {
    if (!this.client || !this.currentTabId) {
      await this.ensureConnected();
      return { reattached: true, message: "Reconnected to Edge." };
    }
    try {
      const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
      const current = targets.find((t) => t.id === this.currentTabId);
      if (current) {
        return { reattached: false };
      }
      // Tab was closed — reattach to first available page
      this.cleanup();
      await this.connect();
      const newTargets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
      const newTab = newTargets.find((t) => t.id === this.currentTabId);
      return {
        reattached: true,
        message: `Previous tab was closed. Now attached to: ${newTab?.title ?? "unknown"} (${newTab?.url ?? "unknown"})`,
      };
    } catch {
      await this.reconnect();
      return { reattached: true, message: "Connection lost. Reconnected." };
    }
  }

  async listTabs(): Promise<TabInfo[]> {
    try {
      const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
      return targets
        .filter((t) => t.type === "page")
        .map((t) => ({ id: t.id, title: t.title, url: t.url }));
    } catch {
      throw new Error(
        "Cannot connect to Edge. Launch the Edge (Debug) shortcut first."
      );
    }
  }

  async activateTab(tabId: string): Promise<TabInfo> {
    await CDP.Activate({ host: CDP_HOST, port: CDP_PORT, id: tabId });
    // Close existing connection and reattach to the new tab
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore close errors
      }
    }
    this.cleanup();
    this.client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: tabId });
    this.currentTabId = tabId;
    await this.enableDomains();
    this.setupDisconnectHandler();
    this.startHeartbeat();

    const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
    const tab = targets.find((t) => t.id === tabId);
    const result: TabInfo = {
      id: tabId,
      title: tab?.title ?? "unknown",
      url: tab?.url ?? "unknown",
    };
    this.writeStateFile(result);
    return result;
  }

  async openNewTab(url?: string): Promise<TabInfo> {
    const client = await this.ensureConnected();
    const result = await (client as any).Target.createTarget({ url: url ?? "about:blank" });
    const newTabId: string = result.targetId;
    return this.activateTab(newTabId);
  }

  async closeTab(tabId: string): Promise<void> {
    const client = await this.ensureConnected();
    await (client as any).Target.closeTarget({ targetId: tabId });
    if (this.currentTabId === tabId) {
      this.cleanup();
      await this.connect();
    }
  }

  private writeStateFile(tab: TabInfo): void {
    try {
      writeFileSync(STATE_FILE, JSON.stringify({
        tabId: tab.id,
        title: tab.title,
        url: tab.url,
        updatedAt: new Date().toISOString(),
      }, null, 2));
    } catch {
      // non-fatal — state file is best-effort
    }
  }

  getPendingDialog(): { type: string; message: string; defaultPrompt?: string } | null {
    return this.pendingDialog;
  }

  clearPendingDialog(): void {
    this.pendingDialog = null;
  }

  getCurrentTabId(): string | null {
    return this.currentTabId;
  }

  getConsoleMessages(): Array<{ level: string; text: string; timestamp: number }> {
    return this.consoleMessages;
  }

  clearConsoleMessages(): void {
    this.consoleMessages = [];
  }

  getNetworkRequests(): Array<{
    requestId: string;
    url: string;
    method: string;
    status?: number;
    size?: number;
  }> {
    return this.networkRequests;
  }

  clearNetworkRequests(): void {
    this.networkRequests = [];
  }
}

export const connectionManager = new ConnectionManager();
export type { TabInfo };
