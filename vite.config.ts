import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleGbPaintRequest } from "./server/endpoints";
import { loadProjectFolder } from "./server/project";

/** The dev server serves the GB Studio project endpoints the desktop app serves (see server/endpoints.ts). */
function gbpaintEndpoints(): Plugin {
  return {
    name: "gbpaint-endpoints",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      loadProjectFolder(root);
      server.middlewares.use((req, res, next) => {
        void handleGbPaintRequest(req, res, { root, backupDir: `${root}/backups`, settingsFile: `${root}/gbpaint.local.json` }).then((handled) => { if (!handled) next(); });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), gbpaintEndpoints()],
  test: { environment: "node" },
});
