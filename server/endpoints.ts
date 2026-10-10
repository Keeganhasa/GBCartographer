/**
 * The endpoints behind GB Cartographer, served by the Vite dev server and the desktop app alike (same-origin only):
 *   GET  /__cartographer/ping                 which GB Studio project is open (name, path), or none
 *   POST /__cartographer/project              { path } opens another project folder (the desktop app also sets it from its dialog);
 *                                             { demo: true } opens a copy of the demo project that ships with the app
 *   GET  /__cartographer/gbstudio-assets      the project's asset PNGs and palettes
 *   GET  /__cartographer/gbstudio-asset       one PNG            ?kind=backgrounds|sprites|tilesets&file=name.png
 *   GET  /__cartographer/gbstudio-asset-info  its size, times, per-cell palette slots and the slot palette ids
 *   GET  /__cartographer/gbstudio-asset-preview the PNG colored the way GB Studio shows it (thumbnails)
 *   POST /__cartographer/gbstudio-asset       overwrite that PNG (same size; ?mtime= guards against a file that changed; &force=1)
 *   POST /__cartographer/gbstudio-tile-colors { slots } per-cell palette slots into the sidecar (?kind=&file=&metaMtime=&force=1)
 *   POST /__cartographer/gbstudio-palette     { name, colors } adds a palette file to the project; { id, name, colors } rewrites one
 *   GET  /__cartographer/gbstudio-running     whether a GB Studio process is running (it may overwrite project JSON when it saves)
 *   POST /__cartographer/reveal               ?kind=&file= shows that asset in Finder / Explorer (no kind: the project folder)
 * GB Cartographer writes asset PNGs, a background's tileColors, a sprite's paletteIndex and palette files; nothing else.
 */
import { execFileSync, spawn } from "node:child_process";
import { dirname } from "node:path";
import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AssetWriteError, assetInfo, assetPath, listAssets, listPalettes, projectName, renderPreview, writeAsset, writePalette, writeSpritePalettes, writeTileColors, type AssetKind } from "./assets";
import { demoProjectCopy, isProjectFolder, projectFolder, projectFolderFor, recentProjects, saveProjectFolder, setProjectFolder } from "./project";

export interface ServerOptions {
  /** The repo or app folder. */
  root: string;
  /** Where the old file goes before GB Cartographer overwrites it (backups/gbstudio/<kind>/<file>). */
  backupDir: string;
  /** Where the chosen project folder is remembered. */
  settingsFile: string;
}

const MAX_BODY = 32 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Shows a file selected in its folder (Finder, Explorer), or opens a folder; Linux opens the folder. */
function revealInFileManager(path: string, isFile: boolean) {
  const [command, args] = process.platform === "darwin" ? ["open", isFile ? ["-R", path] : [path]]
    : process.platform === "win32" ? ["explorer.exe", isFile ? [`/select,${path}`] : [path]]
    : ["xdg-open", [isFile ? dirname(path) : path]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

/** Best effort: is a process called GB Studio running? (It keeps the project in memory and writes it back when it saves.) */
function gbStudioRunning(): boolean {
  try {
    const list = process.platform === "win32" ? execFileSync("tasklist", { encoding: "utf8", timeout: 3000 }) : execFileSync("ps", ["-ax", "-o", "comm="], { encoding: "utf8", timeout: 3000 });
    return /gb studio|gb-studio/i.test(list);
  } catch {
    return false;
  }
}

function reply(res: ServerResponse, status: number, body: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Handles /__cartographer/* requests; returns false for anything else. */
export async function handleCartographerRequest(req: IncomingMessage, res: ServerResponse, options: ServerOptions): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/__cartographer/")) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) {
    reply(res, 403, { error: "Cross-origin requests are not allowed" });
    return true;
  }
  try {
    const project = projectFolder();
    if (url.pathname === "/__cartographer/gbstudio-running") {
      reply(res, 200, { ok: true, running: gbStudioRunning() });
      return true;
    }
    if (url.pathname === "/__cartographer/ping") {
      reply(res, 200, { ok: true, project: project ? { name: projectName(project), path: project } : null, recent: recentProjects(options.settingsFile).map((path) => ({ name: projectName(path), path })) });
      return true;
    }
    if (url.pathname === "/__cartographer/project" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { path?: unknown; demo?: unknown };
      const path = body.demo === true ? demoProjectCopy(options.root, options.settingsFile) ?? "" : typeof body.path === "string" && body.path.trim() ? projectFolderFor(body.path) : "";
      if (body.demo === true && !path) {
        reply(res, 404, { error: "This build has no demo project." });
        return true;
      }
      if (!path) {
        setProjectFolder(null);
        saveProjectFolder(options.settingsFile, null);
        reply(res, 200, { ok: true, project: null });
        return true;
      }
      if (!isProjectFolder(path)) {
        reply(res, 400, { error: "That folder is not a GB Studio project (it needs assets/ and project/ folders)." });
        return true;
      }
      setProjectFolder(path);
      saveProjectFolder(options.settingsFile, projectFolder());
      reply(res, 200, { ok: true, project: { name: projectName(projectFolder()!), path: projectFolder() } });
      return true;
    }
    if (!project) {
      reply(res, 404, { error: "No GB Studio project is open." });
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-assets") {
      reply(res, 200, { ok: true, name: projectName(project), path: project, assets: listAssets(project), palettes: listPalettes(project) });
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-asset" || url.pathname === "/__cartographer/gbstudio-asset-info" || url.pathname === "/__cartographer/gbstudio-asset-preview") {
      const kind = url.searchParams.get("kind") ?? "";
      const path = assetPath(project, kind, url.searchParams.get("file") ?? "");
      if (!path) {
        reply(res, 404, { error: "No such asset" });
        return true;
      }
      if (url.pathname === "/__cartographer/gbstudio-asset-info") {
        reply(res, 200, { ok: true, ...assetInfo(project, kind as AssetKind, path) });
        return true;
      }
      if (url.pathname === "/__cartographer/gbstudio-asset-preview") {
        const png = renderPreview(project, kind as AssetKind, path);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", String(png.length));
        res.setHeader("Cache-Control", "private, max-age=31536000");
        res.end(req.method === "HEAD" ? undefined : Buffer.from(png));
        return true;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const stat = statSync(path);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Last-Modified", stat.mtime.toUTCString());
        res.setHeader("Cache-Control", "no-cache");
        res.end(req.method === "HEAD" ? undefined : readFileSync(path));
        return true;
      }
      if (req.method === "POST") {
        const expected = url.searchParams.get("mtime");
        try {
          const written = writeAsset(path, kind as AssetKind, await readBody(req), options.backupDir, expected === null ? null : Number(expected), url.searchParams.get("force") === "1");
          reply(res, 200, { ok: true, ...written });
        } catch (error) {
          if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message, mtime: error.mtime });
          else throw error;
        }
        return true;
      }
    }
    if (url.pathname === "/__cartographer/reveal" && req.method === "POST") {
      const kind = url.searchParams.get("kind");
      const path = kind ? assetPath(project, kind, url.searchParams.get("file") ?? "") : project;
      if (!path) {
        reply(res, 404, { error: "No such asset" });
        return true;
      }
      revealInFileManager(path, Boolean(kind));
      reply(res, 200, { ok: true });
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-tile-colors" && req.method === "POST") {
      const kind = url.searchParams.get("kind") ?? "backgrounds";
      const path = kind === "backgrounds" || kind === "sprites" || kind === "tilesets" ? assetPath(project, kind, url.searchParams.get("file") ?? "") : null;
      if (!path) {
        reply(res, 404, { error: "No such background or sprite sheet" });
        return true;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { slots?: unknown };
      if (!Array.isArray(body.slots) || !body.slots.every((slot) => slot === null || (Number.isInteger(slot) && slot >= 0 && slot <= 7))) {
        reply(res, 400, { error: "slots must be an array of 0–7 or null" });
        return true;
      }
      const expected = url.searchParams.get("metaMtime");
      try {
        const slots = body.slots as (number | null)[], expectedMtime = expected === null ? null : Number(expected), force = url.searchParams.get("force") === "1";
        const written = kind === "sprites" ? writeSpritePalettes(path, slots, options.backupDir, expectedMtime, force) : writeTileColors(path, slots, options.backupDir, expectedMtime, force, kind as "backgrounds" | "tilesets");
        reply(res, 200, { ok: true, ...written });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message, mtime: error.mtime });
        else throw error;
      }
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-palette" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { id?: unknown; name?: unknown; colors?: unknown };
      try {
        const written = writePalette(project, { id: typeof body.id === "string" ? body.id : undefined, name: String(body.name ?? ""), colors: Array.isArray(body.colors) ? body.colors.map(String) : [] }, options.backupDir);
        reply(res, 200, { ok: true, ...written });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message });
        else throw error;
      }
      return true;
    }
    reply(res, 404, { error: "Unknown endpoint" });
  } catch (error) {
    reply(res, 500, { error: error instanceof Error ? error.message : "Request failed" });
  }
  return true;
}
