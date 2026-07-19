import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: ["es2021", "chrome100", "safari13"], minify: !process.env.TAURI_DEBUG, sourcemap: !!process.env.TAURI_DEBUG },
  resolve: {
    alias: {
      "@zakhira/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@zakhira/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
