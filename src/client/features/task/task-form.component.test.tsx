import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#test/client/render";
import { TaskForm } from "./task-form.component";

describe("TaskForm", () => {
  it("validates with the shared schema before submitting", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Title is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values and resets", async () => {
    const onSubmit = vi.fn(async () => {});
    renderWithProviders(<TaskForm onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "  buy milk  ");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "buy milk" });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
