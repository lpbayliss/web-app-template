import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#test/client/render";
import { LoginForm } from "./login-form.component";

const signIn = vi.fn();
vi.mock("#client/lib/auth.client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signIn(...args) } },
  isAdminUser: () => false,
}));

describe("LoginForm", () => {
  it("shows field errors and does not call the API", async () => {
    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([
      "Enter a valid email address",
      "Use at least 10 characters",
    ]);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in and reports success", async () => {
    signIn.mockResolvedValueOnce({ data: {}, error: null });
    const onSuccess = vi.fn();
    renderWithProviders(<LoginForm onSuccess={onSuccess} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "Ada@Example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(signIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct-horse-battery",
    });
  });

  it("surfaces server errors", async () => {
    signIn.mockResolvedValueOnce({ data: null, error: { message: "Invalid email or password" } });
    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
});
