import type { Preview } from "@storybook/react-vite";
import { IntlProvider } from "../src/client/i18n/intl.provider";
import { ThemeProvider } from "../src/client/providers/theme.provider";
import "../src/client/styles/global.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <IntlProvider locale="en">
          <Story />
        </IntlProvider>
      </ThemeProvider>
    ),
  ],
};

export default preview;
