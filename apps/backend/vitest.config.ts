import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths({ root: '../../' })
  ],
  test: {
    include: ["tests/**.test.ts"],
    globalSetup: "./global-setup.ts",
    testTimeout: 30_000,
    hookTimeout: 300_000,
    watch: false,
    pool: "forks",
  },
});
