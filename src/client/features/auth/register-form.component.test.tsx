import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#test/client/render";
import { RegisterForm } from "./register-form.component";

const signUp = vi.fn();
vi.mock("#client/lib/auth.client", () => ({
  authClient: { signUp: { email: (...args: unknown[]) => signUp(...args) } },
  isAdminUser: () => false,
}));

describe("RegisterForm", () => {
  it("requires a name and valid credentials", async () => {
    renderWithProviders(<RegisterForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([
      "Tell us your name",
      "Enter a valid email address",
      "Use at least 10 characters",
    ]);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("creates the account and reports success", async () => {
    signUp.mockResolvedValueOnce({ data: {}, error: null });
    const onSuccess = vi.fn();
    renderWithProviders(<RegisterForm onSuccess={onSuccess} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(signUp).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "correct-horse-battery",
    });
  });

  it("shows server errors", async () => {
    signUp.mockResolvedValueOnce({ data: null, error: { message: "User already exists" } });
    renderWithProviders(<RegisterForm onSuccess={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("User already exists");
  });
});
