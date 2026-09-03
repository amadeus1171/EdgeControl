import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadHarness, text, type Harness } from "./helpers/harness.js";

let h: Harness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await loadHarness(["emulate"]);
  await h.connectionManager.connect();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("emulate_device", () => {
  it("applies metrics, user agent and touch for a mobile preset", async () => {
    const out = text(await h.server.call("emulate_device", { device: "iPhone 14" }));

    expect(h.fake.client.Emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    expect(h.fake.client.Emulation.setUserAgentOverride).toHaveBeenCalledWith({
      userAgent: expect.stringContaining("iPhone"),
    });
    expect(h.fake.client.Emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: true,
    });
    expect(out).toBe("Emulating iPhone 14: 390x844 @3x, mobile=true, touch=true");
  });

  it("skips the user agent override for a desktop preset that has none", async () => {
    await h.server.call("emulate_device", { device: "Desktop" });

    expect(h.fake.client.Emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    expect(h.fake.client.Emulation.setUserAgentOverride).not.toHaveBeenCalled();
    expect(h.fake.client.Emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: false,
    });
  });

  it("clears every device override on reset", async () => {
    const out = text(await h.server.call("emulate_device", { device: "reset" }));

    expect(h.fake.client.Emulation.clearDeviceMetricsOverride).toHaveBeenCalled();
    expect(h.fake.client.Emulation.setUserAgentOverride).toHaveBeenCalledWith({ userAgent: "" });
    expect(h.fake.client.Emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(out).toBe("Device emulation reset.");
  });

  it("lists the available devices when the name is unknown", async () => {
    const result = await h.server.call("emulate_device", { device: "Nokia 3310" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Unknown device: Nokia 3310");
    expect(text(result)).toContain("iPhone SE");
    expect(text(result)).toContain("Desktop 4K");
    expect(h.fake.client.Emulation.setDeviceMetricsOverride).not.toHaveBeenCalled();
  });

  it("is case-sensitive about device names", async () => {
    const result = await h.server.call("emulate_device", { device: "iphone 14" });

    expect(result.isError).toBe(true);
  });

  it("advertises every preset in its description", () => {
    const description = h.server.tools.get("emulate_device")!.config.description;

    for (const device of ["iPhone SE", "iPad Pro", "Pixel 7", "Laptop", "Desktop 4K"]) {
      expect(description).toContain(device);
    }
  });
});

describe("set_geolocation", () => {
  it("defaults the accuracy to 100m", async () => {
    const out = text(await h.server.call("set_geolocation", {
      latitude: 51.5,
      longitude: -0.12,
    }));

    expect(h.fake.client.Emulation.setGeolocationOverride).toHaveBeenCalledWith({
      latitude: 51.5,
      longitude: -0.12,
      accuracy: 100,
    });
    expect(out).toContain("accuracy: 100m");
  });

  it("passes an explicit accuracy through", async () => {
    await h.server.call("set_geolocation", { latitude: 0, longitude: 0, accuracy: 5 });

    expect(h.fake.client.Emulation.setGeolocationOverride).toHaveBeenCalledWith({
      latitude: 0,
      longitude: 0,
      accuracy: 5,
    });
  });

  it("clears the override", async () => {
    const out = text(await h.server.call("clear_geolocation"));

    expect(h.fake.client.Emulation.clearGeolocationOverride).toHaveBeenCalled();
    expect(out).toBe("Geolocation override cleared.");
  });
});

describe("set_color_scheme", () => {
  it.each(["light", "dark", "no-preference"])("emulates the %s scheme", async (scheme) => {
    const out = text(await h.server.call("set_color_scheme", { scheme }));

    expect(h.fake.client.Emulation.setEmulatedMedia).toHaveBeenCalledWith({
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
    expect(out).toBe(`Color scheme set to: ${scheme}`);
  });
});

describe("set_network_conditions", () => {
  it("takes the throttle off for the online preset", async () => {
    await h.server.call("set_network_conditions", { preset: "online" });

    expect(h.fake.client.Network.emulateNetworkConditions).toHaveBeenCalledWith({
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  });

  it("cuts the connection for the offline preset", async () => {
    await h.server.call("set_network_conditions", { preset: "offline" });

    expect(h.fake.client.Network.emulateNetworkConditions).toHaveBeenCalledWith({
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0,
    });
  });

  it("converts slow-3g's advertised bitrate into bytes per second", async () => {
    const out = text(await h.server.call("set_network_conditions", { preset: "slow-3g" }));

    expect(h.fake.client.Network.emulateNetworkConditions).toHaveBeenCalledWith({
      offline: false,
      // 400 kbps expressed in bytes/sec, as CDP expects.
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });
    expect(out).toBe("Network conditions set to: slow-3g");
  });

  it("gives 4g a lower latency than fast-3g", async () => {
    await h.server.call("set_network_conditions", { preset: "fast-3g" });
    const [fast3g] = h.fake.client.Network.emulateNetworkConditions.mock.calls[0];

    await h.server.call("set_network_conditions", { preset: "4g" });
    const [fourG] = h.fake.client.Network.emulateNetworkConditions.mock.calls[1];

    expect(fourG.latency).toBeLessThan(fast3g.latency);
    expect(fourG.downloadThroughput).toBeGreaterThan(fast3g.downloadThroughput);
  });
});

describe("override_permission", () => {
  it("scopes the override to the current page's origin", async () => {
    const out = text(await h.server.call("override_permission", {
      permission: "geolocation",
      state: "granted",
    }));

    expect(h.fake.client.Browser.setPermission).toHaveBeenCalledWith({
      permission: { name: "geolocation" },
      setting: "granted",
      // Origin, not the full url.
      origin: "https://example.com",
    });
    expect(out).toBe("Permission geolocation set to granted for https://example.com");
  });

  it("omits the origin when the current tab cannot be identified", async () => {
    // The tab verifies fine, then vanishes from the list the tool reads back.
    const stillThere = [...h.fake.targets];
    h.fake.targets = [];
    h.fake.CDP.List.mockImplementationOnce(async () => stillThere);

    const out = text(await h.server.call("override_permission", {
      permission: "camera",
      state: "denied",
    }));

    expect(h.fake.client.Browser.setPermission).toHaveBeenCalledWith({
      permission: { name: "camera" },
      setting: "denied",
      origin: undefined,
    });
    expect(out).toBe("Permission camera set to denied");
  });

  it("returns an error result when the tab url is not a parseable origin", async () => {
    h.fake.targets = [{ id: "tab-1", type: "page", title: "Weird", url: "not a url" }];

    const result = await h.server.call("override_permission", {
      permission: "notifications",
      state: "prompt",
    });

    expect(result.isError).toBe(true);
    expect(h.fake.client.Browser.setPermission).not.toHaveBeenCalled();
  });
});

describe("set_timezone", () => {
  it("applies an IANA timezone id", async () => {
    const out = text(await h.server.call("set_timezone", { timezoneId: "Europe/London" }));

    expect(h.fake.client.Emulation.setTimezoneOverride).toHaveBeenCalledWith({
      timezoneId: "Europe/London",
    });
    expect(out).toBe("Timezone set to: Europe/London");
  });

  it("returns an error result for a timezone the browser rejects", async () => {
    h.fake.client.Emulation.setTimezoneOverride.mockRejectedValue(
      new Error("Invalid timezone id")
    );

    const result = await h.server.call("set_timezone", { timezoneId: "Mars/Olympus" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Invalid timezone id");
  });
});

describe("reset_emulation", () => {
  it("clears every category of override", async () => {
    const out = text(await h.server.call("reset_emulation"));

    expect(h.fake.client.Emulation.clearDeviceMetricsOverride).toHaveBeenCalled();
    expect(h.fake.client.Emulation.setUserAgentOverride).toHaveBeenCalledWith({ userAgent: "" });
    expect(h.fake.client.Emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(h.fake.client.Emulation.clearGeolocationOverride).toHaveBeenCalled();
    expect(h.fake.client.Emulation.setEmulatedMedia).toHaveBeenCalledWith({ features: [] });
    expect(h.fake.client.Network.emulateNetworkConditions).toHaveBeenCalledWith({
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    expect(out).toBe("All emulation overrides reset.");
  });

  it("still succeeds when the browser cannot clear the timezone", async () => {
    // Some CDP builds reject an empty timezoneId; the reset must not fail for it.
    h.fake.client.Emulation.setTimezoneOverride.mockRejectedValue(new Error("unsupported"));

    const result = await h.server.call("reset_emulation");

    expect(result.isError).toBeUndefined();
    expect(text(result)).toBe("All emulation overrides reset.");
  });

  it("returns an error result when an earlier reset step fails", async () => {
    h.fake.client.Emulation.clearDeviceMetricsOverride.mockRejectedValue(new Error("detached"));

    const result = await h.server.call("reset_emulation");

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("detached");
  });
});
