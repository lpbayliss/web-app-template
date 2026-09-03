import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "#shared/schemas/task.schema";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { TaskList } from "./task-list.component";

const now = new Date().toISOString();
const tasks: Task[] = [
  {
    id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2c",
    title: "Write docs",
    completed: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2d",
    title: "Ship",
    completed: true,
    createdAt: now,
    updatedAt: now,
  },
];

describe("TaskList", () => {
  it("renders tasks and the open count", async () => {
    server.use(trpcMock.query("task.list", tasks));
    renderWithProviders(<TaskList />);
    expect(await screen.findByText("Write docs")).toBeInTheDocument();
    expect(screen.getByText("1 open task")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mark open" })).toBeChecked();
  });

  it("shows the empty state", async () => {
    server.use(trpcMock.query("task.list", []));
    renderWithProviders(<TaskList />);
    expect(await screen.findByText(/Add your first task/)).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    server.use(trpcMock.error("task.list", "INTERNAL_SERVER_ERROR"));
    renderWithProviders(<TaskList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load tasks.");
  });

  it("adds a task optimistically and then reconciles with the server", async () => {
    const created = vi.fn((input: unknown) => ({
      ...tasks[0]!,
      id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2e",
      title: (input as { title: string }).title,
    }));
    let list = tasks;
    server.use(
      trpcMock.query("task.list", () => list),
      trpcMock.mutation("task.create", (input) => {
        const task = created(input);
        list = [task, ...list];
        return task;
      }),
    );
    renderWithProviders(<TaskList />);
    await screen.findByText("Write docs");
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "New one");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("New one")).toBeInTheDocument();
    await waitFor(() =>
      expect(created).toHaveBeenCalledWith(expect.objectContaining({ title: "New one" })),
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("toggles and removes", async () => {
    const update = vi.fn((input: unknown) => ({ ...tasks[0]!, ...(input as object) }));
    const remove = vi.fn((input: unknown) => ({ id: (input as { id: string }).id }));
    server.use(
      trpcMock.query("task.list", tasks),
      trpcMock.mutation("task.update", update),
      trpcMock.mutation("task.remove", remove),
    );
    renderWithProviders(<TaskList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Mark done" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: tasks[0]!.id, completed: true }));
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: tasks[1]!.id }));
  });
});
