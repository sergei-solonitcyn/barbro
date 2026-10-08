import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      exclude: [
        ...coverageConfigDefaults.exclude,

        // Declarative input for drizzle-kit: Drizzle calls these callbacks only when building
        // table config for migration generation, never at runtime. Behavior is covered through
        // the generated migrations (database.module tests); schema/migration drift is checked in CI.
        // Keep this file to be declarations-only: any logic added here would be invisible to coverage.
        "src/db/schema.ts",

        // Test support (test app factory, fake OpenID Provider): not shipped, see tsconfig.build.json.
        "src/testing/**",
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    globals: false,
    include: ["**/*.spec.ts"],
    root: "./",
  },
});
