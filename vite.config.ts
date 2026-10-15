/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Served from https://revind4k.github.io/job-tracker-web/ on GitHub Pages.
  base: process.env.GITHUB_PAGES ? "/job-tracker-web/" : "/",
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"], // e2e/ belongs to Playwright
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
