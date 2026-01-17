import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
    },
    // Use projects to separate unit and integration tests (Vitest 4+)
    projects: [
      {
        // Unit tests - manual mocks, no MSW
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
          setupFiles: ["./tests/setup.unit.ts"],
        },
      },
      {
        // Integration tests - MSW enabled
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
