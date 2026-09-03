import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#test/client/render";
import { ActivityFeed } from "./activity-feed.component";

const feed = vi.hoisted(() => ({ events: [] as unknown[], status: "connecting" as string }));
vi.mock("./use-activity-feed.hook", () => ({ useActivityFeed: () => feed }));

describe("ActivityFeed", () => {
  it("shows the empty state while connecting", () => {
    renderWithProviders(<ActivityFeed />);
    expect(screen.getByTestId("activity-status")).toHaveTextContent("Connecting…");
    expect(screen.getByText(/show up here in real time/)).toBeInTheDocument();
  });

  it("renders events with relative times once live", () => {
    feed.status = "pending";
    feed.events = [
      {
        id: "1",
        type: "task.created",
        userId: "u",
        taskId: "t",
        title: "Docs",
        at: new Date().toISOString(),
      },
      {
        id: "2",
        type: "task.deleted",
        userId: "u",
        taskId: "t2",
        at: new Date(Date.now() - 120_000).toISOString(),
      },
    ];
    renderWithProviders(<ActivityFeed />);
    expect(screen.getByTestId("activity-status")).toHaveTextContent("Live");
    expect(screen.getByText("Created “Docs”")).toBeInTheDocument();
    expect(screen.getByText("Deleted a task")).toBeInTheDocument();
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });
});
