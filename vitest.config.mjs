import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { transformWithEsbuild } from "vite";

export default defineConfig({
  resolve: {
    // No Next, server-only impede imports no browser. Os testes executam no servidor.
    alias: { "server-only": "next/dist/compiled/server-only/empty.js" },
  },
  plugins: [
    {
      name: "source-jsx-in-js",
      enforce: "pre",
      async transform(code, id) {
        if (/[/\\]src[/\\].*\.js$/.test(id)) {
          return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
        }
      },
    },
    tsconfigPaths({ projects: ["./jsconfig.json"] }),
    react(),
  ],

  esbuild: {
    jsx: "automatic", // ✅ this is the important part
    loader: "jsx",
    include: [/src[\\/].*\.jsx?$/], // windows-safe
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
    css: true, // optional but prevents the next error (CSS modules)
  },
});
