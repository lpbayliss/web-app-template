import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { QueueStats } from "./queue-stats.component";

describe("QueueStats", () => {
  it("renders each queue state with its count and links to the dashboard", async () => {
    server.use(trpcMock.query("admin.queueStats", { waiting: 3, active: 1, failed: 0 }));
    renderWithProviders(<QueueStats />);
    expect(await screen.findByText("waiting")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Queue dashboard" })).toHaveAttribute(
      "href",
      "/admin/queues",
    );
  });
});
