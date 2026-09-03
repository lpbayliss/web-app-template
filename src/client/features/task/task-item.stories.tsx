import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskItem } from "./task-item.component";

const meta = {
  title: "Features/Task/TaskItem",
  component: TaskItem,
  args: {
    onToggle: fn(),
    onRemove: fn(),
    task: {
      id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2c",
      title: "Review the pull request",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  decorators: [(Story) => <ul className="w-96">{Story()}</ul>],
} satisfies Meta<typeof TaskItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Completed: Story = { args: { task: { ...meta.args.task, completed: true } } };
