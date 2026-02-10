import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "sqlglot-ts": path.resolve(__dirname, "../src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
});
