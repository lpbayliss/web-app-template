import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { UserTable } from "./user-table.component";

const users = [
  {
    id: "me",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    banned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "u2",
    email: "bob@example.com",
    name: "Bob",
    role: "user",
    banned: true,
    createdAt: new Date().toISOString(),
  },
];

describe("UserTable", () => {
  it("lists users, hides the role button for the current user and promotes others", async () => {
    const setRole = vi.fn((input: unknown) => input);
    server.use(
      trpcMock.query("admin.listUsers", (input) => {
        const search = (input as { search?: string } | undefined)?.search;
        const items = search ? users.filter((u) => u.email.includes(search)) : users;
        return { items, total: items.length, limit: 50, offset: 0 };
      }),
      trpcMock.mutation("admin.setRole", setRole),
    );
    renderWithProviders(<UserTable currentUserId="me" />);
    expect(await screen.findByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("2 users")).toBeInTheDocument();
    expect(screen.getByText("Banned")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Make/ })).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(setRole).toHaveBeenCalledWith({ userId: "u2", role: "admin" }));

    await user.type(screen.getByRole("searchbox"), "admin");
    await waitFor(() => expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument());
  });
});
