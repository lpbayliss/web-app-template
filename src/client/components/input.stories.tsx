import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input.component";

const meta = {
  title: "Components/Input",
  component: Input,
  args: { label: "Email", placeholder: "you@example.com" },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithError: Story = {
  args: { error: "Enter a valid email address", defaultValue: "nope" },
};
