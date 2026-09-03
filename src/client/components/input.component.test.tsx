import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input.component";

describe("Input", () => {
  it("associates the label with the input", () => {
    render(<Input label="Email" name="email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
  });

  it("exposes errors to assistive tech", () => {
    render(<Input label="Email" error="Required" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });
});
