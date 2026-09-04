import { afterEach, describe, expect, it, vi } from "vitest";
import { analytics, TRACKER_SCRIPT_ID } from "./analytics.client";

const config = { url: "http://umami.test", websiteId: "site-1" };

function stubUmami() {
  const umami = { track: vi.fn(), identify: vi.fn() };
  window.umami = umami;
  return umami;
}

describe("analytics client", () => {
  afterEach(() => {
    document.getElementById(TRACKER_SCRIPT_ID)?.remove();
    delete window.umami;
    analytics.identify(null);
  });

  it("does nothing until the tracker script is loaded", () => {
    expect(() => {
      analytics.page();
      analytics.track("theme.changed", { theme: "dark" });
      analytics.identify("u1");
    }).not.toThrow();
  });

  it("injects the tracker script once with auto-tracking off", () => {
    analytics.init(config);
    analytics.init(config);
    const scripts = document.querySelectorAll(`#${TRACKER_SCRIPT_ID}`);
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe("http://umami.test/script.js");
    expect(script.defer).toBe(true);
    expect(script.dataset).toMatchObject({
      websiteId: "site-1",
      autoTrack: "false",
      doNotTrack: "true",
    });
  });

  it("forwards page views, events and identify to window.umami", () => {
    const umami = stubUmami();
    analytics.page();
    analytics.track("locale.changed", { locale: "de" });
    analytics.identify("u1");
    analytics.identify(null);
    expect(umami.track).toHaveBeenNthCalledWith(1);
    expect(umami.track).toHaveBeenNthCalledWith(2, "locale.changed", { locale: "de" });
    expect(umami.identify).toHaveBeenCalledTimes(1);
    expect(umami.identify).toHaveBeenCalledWith("u1");
  });

  it("replays the current user and sends the first page view when the script loads", () => {
    analytics.identify("u1");
    analytics.init(config);
    const umami = stubUmami();
    document.getElementById(TRACKER_SCRIPT_ID)?.dispatchEvent(new Event("load"));
    expect(umami.identify).toHaveBeenCalledWith("u1");
    expect(umami.track).toHaveBeenCalledTimes(1);
  });
});
