import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8000,
  },
  build: {
    outDir: "dist",
  },
  json: { namedExports: true, stringify: false },
  resolve: {
    alias: {
      src: "/src",
      test: "/test",
      "@": "/src",
      "@game": "/src/features/gameplay",
      "@pages": "/src/pages", // Alias for pages
      "@style": "/src/style", // Alias for style
      "@test": "/test",
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    alias: {
      src: "/src",
      test: "/test",
      "@": "/src",
      "@game": "/src/features/gameplay",
      "@pages": "/src/pages",
      "@style": "/src/style",
      "@test": "/test",
    },
    reporters: ["dot"],
  },
});