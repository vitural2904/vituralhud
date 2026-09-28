import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 15000,
    coverage: { provider: 'v8', reporter: ['text', 'json-summary', 'html'], include: ['server/**/*.ts', 'src/domain/**/*.ts', 'src/state-channel.ts', 'scripts/*.mjs'], exclude: ['**/*.test.ts', 'server/index.ts'] },
  },
});
