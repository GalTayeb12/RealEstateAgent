import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 150_000,      // avatar may take 30-60 s to start speaking after LiveKit connect
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // Headless works fine for RMS measurement — the AnalyserNode processes
    // audio even when there are no speakers.
    headless: true,
    launchOptions: {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-web-security",
        "--allow-running-insecure-content",
      ],
    },
    permissions: ["microphone"],
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
