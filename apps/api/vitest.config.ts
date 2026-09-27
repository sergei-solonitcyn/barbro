import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  test: {
    globals: false,
    root: "./",
    include: ["**/*.spec.ts"],
  },
});
