import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the web app's logic (format, dates, money previews, the API
// error chain, CSP, lint rules). Browser flows are Playwright's (e2e/).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
      { find: "@business-os/types", replacement: fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    environment: "node",
  },
});
