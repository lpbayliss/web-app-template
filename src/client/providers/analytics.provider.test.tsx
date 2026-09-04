import type { AnyRouter } from "@tanstack/react-router";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRACKER_SCRIPT_ID } from "#client/lib/analytics.client";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { AnalyticsProvider } from "./analytics.provider";

const enabled = { analytics: { url: "http://umami.test", websiteId: "site-1" } };

function fakeRouter() {
  const listeners: (() => void)[] = [];
  const router = {
    subscribe: vi.fn((_event: string, listener: () => void) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }),
  } as unknown as Pick<AnyRouter, "subscribe">;
  return {
    router,
    navigate: () => {
      for (const listener of listeners) listener();
    },
  };
}

describe("AnalyticsProvider", () => {
  afterEach(() => {
    document.getElementById(TRACKER_SCRIPT_ID)?.remove();
    delete window.umami;
  });

  it("renders children and stays idle when analytics is off", async () => {
    server.use(trpcMock.query("system.config", { analytics: null }));
    const { router } = fakeRouter();
    renderWithProviders(
      <AnalyticsProvider router={router} userId={null}>
        <p>child</p>
      </AnalyticsProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the config query settle
    expect(document.getElementById(TRACKER_SCRIPT_ID)).toBeNull();
    expect(router.subscribe).not.toHaveBeenCalled();
  });

  it("loads the tracker, reports navigations and identifies the user", async () => {
    server.use(trpcMock.query("system.config", enabled));
    const { router, navigate } = fakeRouter();
    const umami = { track: vi.fn(), identify: vi.fn() };
    window.umami = umami;
    const view = renderWithProviders(
      <AnalyticsProvider router={router} userId="u1">
        <p>child</p>
      </AnalyticsProvider>,
    );
    await waitFor(() =>
      expect(document.getElementById(TRACKER_SCRIPT_ID)).toHaveAttribute(
        "src",
        "http://umami.test/script.js",
      ),
    );
    expect(router.subscribe).toHaveBeenCalledWith("onResolved", expect.any(Function));
    expect(umami.identify).toHaveBeenCalledWith("u1");
    navigate();
    expect(umami.track).toHaveBeenCalledWith();

    view.rerender(
      <AnalyticsProvider router={router} userId="u2">
        <p>child</p>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(umami.identify).toHaveBeenCalledWith("u2"));
  });
});
