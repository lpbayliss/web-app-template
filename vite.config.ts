import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The API server owns /api, including the WebSocket upgrade and auth cookies.
      "/api": { target: API_TARGET, changeOrigin: false, ws: true },
      "/admin/queues": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rolldownOptions: {
      output: {
        // Stable vendor chunks cache well across deploys.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "tanstack", test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|framer-motion)[\\/]/ },
          ],
        },
      },
    },
  },
});
