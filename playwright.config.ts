import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the REAL Spring Boot API and PostgreSQL (no mocks). The API must
// already be running at API_URL with CORS_ORIGINS allowing this app's origin; CI starts it.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_URL: process.env.API_URL ?? "http://localhost:8080" },
  },
});
