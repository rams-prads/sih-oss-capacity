import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // ponytail: vitest 2.x workers crash on Node 24 when run in parallel; serial is
    // also faster for a suite this size (10s vs 44s). Drop when vitest is upgraded.
    fileParallelism: false,
  },
});
