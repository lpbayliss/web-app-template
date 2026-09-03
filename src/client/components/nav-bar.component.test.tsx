import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "#client/features/auth/use-session.hook";
import { renderWithRouter } from "#test/client/render";
import { NavBar } from "./nav-bar.component";

const base: SessionState = {
  user: null,
  isPending: false,
  isAdmin: false,
  refetch: vi.fn(),
  signOut: vi.fn(),
};

describe("NavBar", () => {
  it("shows sign-in for anonymous visitors and hides admin", async () => {
    renderWithRouter(<NavBar session={base} />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows admin link and sign-out for admins", async () => {
    const signOut = vi.fn(async () => {});
    renderWithRouter(
      <NavBar
        session={{
          ...base,
          isAdmin: true,
          signOut,
          user: { id: "1", role: "admin" } as SessionState["user"],
        }}
      />,
    );
    expect(await screen.findByRole("link", { name: "Admin" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("switches language", async () => {
    renderWithRouter(<NavBar session={base} />);
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Language" }), "de");
    expect(await screen.findByRole("link", { name: "Aufgaben" })).toBeInTheDocument();
  });
});
