import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/ts/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts is the stdio entrypoint — it connects a transport on import,
      // so it is exercised by the registration test, not by unit tests.
      exclude: ["src/index.ts"],
      reporter: ["text", "html"],
      // The project standard is 80% minimum on every metric.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
