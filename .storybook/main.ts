import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/client/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    // Storybook does not need the API proxy or the manual chunking from vite.config.ts.
    server: { ...viteConfig.server, proxy: undefined },
  }),
};

export default config;
