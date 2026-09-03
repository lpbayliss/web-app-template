import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./theme.provider";

function Probe() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <div>
      <output data-testid="state">
        {theme}/{resolved}
      </output>
      <button type="button" onClick={() => setTheme("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        system
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to the system theme", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("persists an explicit choice and toggles the dark class", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "system" }));
    });
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("restores the stored theme on mount", () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
  });

  it("throws when used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/inside <ThemeProvider>/);
  });
});
