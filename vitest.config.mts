import { defineConfig } from "vitest/config";
import path from "node:path";
import { readFileSync } from "node:fs";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    env: (() => {
      try {
        const content = readFileSync(path.resolve(rootDir, ".env"), "utf-8");
        const env: Record<string, string> = {};
        for (const line of content.split("\n")) {
          const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
          if (m) env[m[1]] = m[2];
        }
        return env;
      } catch {
        return {};
      }
    })(),
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
