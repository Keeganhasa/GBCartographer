import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { handleCartographerRequest } from "./server/endpoints";
import { loadProjectFolder } from "./server/project";

/** The dev server serves the GB Studio project endpoints the desktop app serves (see server/endpoints.ts). */
function cartographerEndpoints(): Plugin {
  return {
    name: "cartographer-endpoints",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      loadProjectFolder(root);
      server.middlewares.use((req, res, next) => {
        void handleCartographerRequest(req, res, { root, backupDir: `${root}/backups`, settingsFile: `${root}/cartographer.local.json` }).then((handled) => { if (!handled) next(); });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version) },
  plugins: [react(), cartographerEndpoints()],
  test: { environment: "node" },
});
