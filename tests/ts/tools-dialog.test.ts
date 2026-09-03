import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["dialog"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

function openDialog(params: { type: string; message: string; defaultPrompt?: string }): void {
  h.fake.emit("javascriptDialogOpening", params);
}

describe("get_pending_dialog", () => {
  it("says so when nothing is waiting", async () => {
    expect(text(await h.server.call("get_pending_dialog"))).toBe("No pending dialog.");
  });

  it("reports the type and message of an open alert", async () => {
    openDialog({ type: "alert", message: "Saved!" });

    const out = text(await h.server.call("get_pending_dialog"));

    expect(out).toBe("Dialog type: alert\nMessage: Saved!");
  });

  it("includes the default value for a prompt", async () => {
    openDialog({ type: "prompt", message: "Your name?", defaultPrompt: "anon" });

    expect(text(await h.server.call("get_pending_dialog"))).toContain(
      "Default prompt value: anon"
    );
  });

  it("includes an empty default rather than omitting the line", async () => {
    openDialog({ type: "prompt", message: "Your name?", defaultPrompt: "" });

    expect(text(await h.server.call("get_pending_dialog"))).toContain("Default prompt value: ");
  });
});

describe("handle_dialog", () => {
  it("accepts a dialog and clears the pending state", async () => {
    openDialog({ type: "confirm", message: "Sure?" });

    const out = text(await h.server.call("handle_dialog", { accept: true }));

    expect(h.fake.client.Page.handleJavaScriptDialog).toHaveBeenCalledWith({ accept: true });
    expect(out).toBe("Dialog accepted");
    expect(h.connectionManager.getPendingDialog()).toBeNull();
  });

  it("dismisses a dialog", async () => {
    openDialog({ type: "confirm", message: "Sure?" });

    const out = text(await h.server.call("handle_dialog", { accept: false }));

    expect(h.fake.client.Page.handleJavaScriptDialog).toHaveBeenCalledWith({ accept: false });
    expect(out).toBe("Dialog dismissed");
  });

  it("passes prompt text through to the page", async () => {
    openDialog({ type: "prompt", message: "Your name?" });

    const out = text(await h.server.call("handle_dialog", { accept: true, promptText: "Ada" }));

    expect(h.fake.client.Page.handleJavaScriptDialog).toHaveBeenCalledWith({
      accept: true,
      promptText: "Ada",
    });
    expect(out).toBe("Dialog accepted with text: Ada");
  });

  it("omits promptText entirely when it was not supplied", async () => {
    await h.server.call("handle_dialog", { accept: true });

    const [params] = h.fake.client.Page.handleJavaScriptDialog.mock.calls[0];
    expect(params).not.toHaveProperty("promptText");
  });

  it("leaves the pending dialog in place when handling fails", async () => {
    openDialog({ type: "alert", message: "Saved!" });
    h.fake.client.Page.handleJavaScriptDialog.mockRejectedValue(
      new Error("No dialog is showing")
    );

    const result = await h.server.call("handle_dialog", { accept: true });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("No dialog is showing");
    expect(h.connectionManager.getPendingDialog()).not.toBeNull();
  });
});
