import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tsconfigPaths({ root: '../../' })
  ],
  test: {
    include: ["tests/**/*.test.ts", "tests/*.test.ts"],
    globalSetup: "./global-setup.ts",
    testTimeout: 200_000,
    hookTimeout: 200_000,
    watch: false,
    pool: "forks",
    fileParallelism: false,
  },
});
