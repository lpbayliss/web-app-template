import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormattedMessage } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLocale, IntlProvider, useLocale } from "./intl.provider";

function Probe() {
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <output data-testid="locale">{locale}</output>
      <h1>
        <FormattedMessage id="tasks.title" />
      </h1>
      <button type="button" onClick={() => setLocale("de")}>
        de
      </button>
    </div>
  );
}

describe("detectLocale", () => {
  it("picks the first supported language, ignoring regions", () => {
    expect(detectLocale(["fr-FR", "de-AT", "en"])).toBe("de");
    expect(detectLocale(["fr"])).toBe("en");
  });
});

describe("IntlProvider", () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    delete window.umami;
  });

  it("renders English by default and switches locale on demand", async () => {
    const user = userEvent.setup();
    render(
      <IntlProvider locale="en">
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Tasks");
    await user.click(screen.getByRole("button", { name: "de" }));
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Aufgaben"));
    expect(screen.getByTestId("locale")).toHaveTextContent("de");
    expect(localStorage.getItem("locale")).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("restores a stored locale", async () => {
    localStorage.setItem("locale", "de");
    render(
      <IntlProvider>
        <Probe />
      </IntlProvider>,
    );
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Aufgaben"));
  });

  it("reports locale changes to analytics", async () => {
    const umami = { track: vi.fn(), identify: vi.fn() };
    window.umami = umami;
    const user = userEvent.setup();
    render(
      <IntlProvider>
        <Probe />
      </IntlProvider>,
    );
    await user.click(screen.getByRole("button", { name: "de" }));
    expect(umami.track).toHaveBeenCalledWith("locale.changed", { locale: "de" });
  });
});
