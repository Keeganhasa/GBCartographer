/**
 * GB Cartographer desktop app: serves the built page from a local server that also answers the GB Studio project
 * endpoints (server/endpoints.ts), then opens it in a window. The project folder comes from a folder dialog and
 * is remembered in the app's settings file.
 *   npm run desktop        build and launch
 *   npm run desktop:dev    launch against a running `npm run dev` (hot reload)
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { handleCartographerRequest } from "../server/endpoints";
import { loadProjectFolder, projectFolder, projectFolderFor, projectProblem, saveProjectFolder, setProjectFolder } from "../server/project";

const ROOT = resolve(__dirname, "..");
const ICON = join(ROOT, "build", "icon.png");
const DIST = join(ROOT, "dist");
const DEV_URL = process.argv.includes("--dev") ? "http://127.0.0.1:5173/" : null;
const APP_NAME = "GB Cartographer";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff2": "font/woff2" };

const settingsFile = () => join(app.getPath("userData"), "settings.json");
const serverOptions = () => ({ root: ROOT, backupDir: join(app.getPath("userData"), "backups"), settingsFile: settingsFile() });

function startServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    void handleCartographerRequest(req, res, serverOptions()).then((handled) => {
      if (handled) return;
      const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      const file = normalize(join(DIST, path === "/" ? "index.html" : path));
      if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
      res.end(req.method === "HEAD" ? undefined : readFileSync(file));
    });
  });
  // A fixed port keeps the same origin between launches, so the browser storage behind the app (the open
  // pictures, theme, settings) is still there next time. GBC_PORT overrides it; if busy, a random port is used.
  const port = Number(process.env.GBC_PORT) || 62932;
  return new Promise((resolveServer) => {
    const done = () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/` });
    };
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") throw error;
      console.warn(`Port ${port} is busy; using a random port (this run's pictures and settings stay separate)`);
      server.listen(0, "127.0.0.1", done);
    });
    server.listen(port, "127.0.0.1", done);
  });
}

async function createWindow() {
  const target = DEV_URL ?? (await startServer()).url;
  console.log(`${APP_NAME} serving ${target}`);
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: APP_NAME,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    backgroundColor: "#000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(__dirname, "preload.cjs") },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Closing: the page gets a moment to write its session, then the window goes. One click always closes it.
  let closing = false;
  window.on("close", (event) => {
    if (closing) return;
    closing = true;
    event.preventDefault();
    const finish = () => { if (!window.isDestroyed()) window.destroy(); };
    const giveUp = setTimeout(finish, 3000);
    window.webContents.executeJavaScript("window.__gbcFlushSession ? window.__gbcFlushSession() : true", true)
      .catch(() => null)
      .finally(() => { clearTimeout(giveUp); finish(); });
  });
  await window.loadURL(target);
}

/** The page asks for a project folder; the choice is kept for next time. Returns the folder, or null when cancelled. */
ipcMain.handle("gbc-choose-project", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  // The .gbsproj file or its folder: both open the project (macOS greys out Open inside a folder in folder-only mode).
  const result = await dialog.showOpenDialog(window ?? undefined as never, {
    title: "Open a GB Studio project",
    message: "Pick the project's .gbsproj file, or the folder that holds it.",
    buttonLabel: "Open project",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "GB Studio project", extensions: ["gbsproj"] }],
    ...(projectFolder() ? { defaultPath: projectFolder()! } : {}),
  });
  const picked = result.canceled ? null : result.filePaths[0];
  if (!picked) return null;
  const folder = projectFolderFor(picked);
  const problem = projectProblem(folder);
  if (problem) {
    await dialog.showMessageBox({ type: "warning", message: "GB Cartographer can't open this project.", detail: problem });
    return null;
  }
  setProjectFolder(folder);
  saveProjectFolder(settingsFile(), projectFolder());
  return projectFolder();
});

app.setName(APP_NAME);
// One GB Cartographer at a time: a second launch would land on another port with an empty session and look like
// lost work. It focuses the open window instead.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return void createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});
app.whenReady().then(() => {
  if (process.platform === "darwin" && existsSync(ICON)) app.dock?.setIcon(ICON);
  loadProjectFolder(ROOT, settingsFile());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
  return createWindow();
});
let quitting = false;
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || quitting) app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
