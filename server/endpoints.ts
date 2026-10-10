/**
 * The endpoints behind GB Cartographer, served by the Vite dev server and the desktop app alike (same-origin only):
 *   GET  /__cartographer/ping                 which GB Studio project is open (name, path), or none
 *   POST /__cartographer/project              { path } opens another project folder (the desktop app also sets it from its dialog);
 *                                             { demo: true } opens a copy of the demo project that ships with the app;
 *                                             { demo: true, reset: true } first moves that copy to the backups folder
 *   GET  /__cartographer/gbstudio-assets      the project's asset PNGs and palettes
 *   GET  /__cartographer/gbstudio-asset       one PNG            ?kind=backgrounds|sprites|tilesets|fonts|emotes|avatars|ui&file=name.png
 *   GET  /__cartographer/gbstudio-asset-info  its size, times, per-cell palette slots and the slot palette ids
 *   GET  /__cartographer/gbstudio-asset-preview the PNG colored the way GB Studio shows it (thumbnails)
 *   POST /__cartographer/gbstudio-asset       overwrite that PNG (same size; ?mtime= guards against a file that changed; &force=1;
 *                                             &resize=1 allows a new size in whole tiles)
 *   POST /__cartographer/gbstudio-new-asset   ?kind=&name= a new PNG in assets/<kind>/ (never replaces a file; no sidecar)
 *   POST /__cartographer/gbstudio-tile-colors { slots } per-cell palette slots into the sidecar (?kind=&file=&metaMtime=&force=1)
 *   POST /__cartographer/gbstudio-palette     { name, colors } adds a palette file to the project; { id, name, colors } rewrites one
 *   POST /__cartographer/gbstudio-palette-slot { slot, paletteId } puts a palette in an asset's slot (?kind=&file=): the
 *                                             scene's palette list, or the project's default palettes
 *   GET  /__cartographer/gbstudio-running     whether a GB Studio process is running (it may overwrite project JSON when it saves)
 *   POST /__cartographer/reveal               ?kind=&file= shows that asset in Finder / Explorer (no kind: the project folder;
 *                                             ?backups=1: this project's backups folder)
 *   GET  /__cartographer/gbstudio-preview-sheet ?kind= every thumbnail of a kind on one sheet: { stamp, cells } here,
 *                                             the image at gbstudio-preview-sheet.png?kind=&stamp= (cached by stamp)
 *   POST /__cartographer/gbstudio-palette-remove { id } takes an unused palette out (to the backups folder; 409 when used)
 *   GET  /__cartographer/maps                 the project's Map Room layouts; POST { maps } saves them (kept in the app's
 *                                             data folder, never in the project)
 *   GET  /__cartographer/dialogue-settings    { colorMode, uiPalette, defaultFont, fonts } for the dialogue preview (read only)
 *   GET  /__cartographer/project-health       { colorMode, issues: [{ level, kind, file?, title, detail }] } (read only)
 *   GET  /__cartographer/palette-usage        which scenes (and defaults) use each palette, and same-colored palettes
 *   POST /__cartographer/asset-times          { assets: [{ kind, file }] } their PNG and sidecar times (null: gone)
 *   GET  /__cartographer/backups              this project's backed-up files and their versions (?file= one file)
 *   GET  /__cartographer/backup               one version's bytes (?file=&version=; version=current: the file now)
 *   POST /__cartographer/backup-restore       { file, version } puts that version back (the current file is backed up first)
 * GB Cartographer writes asset PNGs, a background's or tileset's tileColors, a sprite's paletteIndex, palette files,
 * a scene's palette lists and the project's default palettes; nothing else.
 */
import { execFileSync, spawn } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AssetWriteError, ASSET_KINDS, createAsset, dialogueSettings, paletteUsage, previewSheet, projectHealth, removePalette, assetInfo, assetPath, listAssets, listPalettes, projectName, renderPreview, writeAsset, writePalette, writePaletteSlot, writeSpritePalettes, writeTileColors, type AssetKind } from "./assets";
import { backupPath, listBackups, projectBackupDir, restoreBackup } from "./backups";
import { readMaps, writeMaps } from "./maps";
import { demoProjectCopy, projectFolder, projectFolderFor, projectProblem, projectVersion, recentProjects, saveProjectFolder, setProjectFolder, versionNote } from "./project";

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

/** Whether the request names this machine (127.0.0.1, localhost or [::1]) on the port it arrived at. */
function localHost(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  const match = /^(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/i.exec(host);
  return Boolean(match) && Number(match![2]) === req.socket.localPort;
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
  // Only this machine's own address: a page that rebinds its DNS name to 127.0.0.1 still sends its own Host, so it
  // is refused here (the Origin check alone would pass it, since Origin and Host would match).
  if (!localHost(req)) {
    reply(res, 403, { error: "GB Cartographer only answers on this machine's own address" });
    return true;
  }
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
      reply(res, 200, { ok: true, project: project ? { name: projectName(project), path: project, version: projectVersion(project), versionNote: versionNote(project) } : null, recent: recentProjects(options.settingsFile).map((path) => ({ name: projectName(path), path })) });
      return true;
    }
    if (url.pathname === "/__cartographer/project" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { path?: unknown; demo?: unknown; reset?: unknown };
      const path = body.demo === true ? demoProjectCopy(options.root, options.settingsFile, body.reset === true ? { backupDir: options.backupDir } : undefined) ?? "" : typeof body.path === "string" && body.path.trim() ? projectFolderFor(body.path) : "";
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
      const problem = projectProblem(path);
      if (problem) {
        reply(res, 400, { error: problem });
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
    const backup = { dir: options.backupDir, project };
    if (url.pathname === "/__cartographer/backups") {
      // `older`: the flat backups folder from before backups kept history (one copy per file name, any project).
      reply(res, 200, { ok: true, folder: projectBackupDir(options.backupDir, project), older: existsSync(resolve(options.backupDir, "gbstudio")), files: listBackups(options.backupDir, project, url.searchParams.get("file") ?? undefined) });
      return true;
    }
    if (url.pathname === "/__cartographer/backup") {
      // version=current: the file as it is in the project now, for a file that has backups (to compare with one).
      const file = url.searchParams.get("file") ?? "", version = url.searchParams.get("version") ?? "";
      const current = version === "current" && listBackups(options.backupDir, project, file).length ? resolve(project, ...file.split("/")) : null;
      const path = current ? (current.startsWith(resolve(project) + sep) && existsSync(current) ? current : null) : backupPath(options.backupDir, project, file, version);
      if (!path) {
        reply(res, 404, { error: "No such backup" });
        return true;
      }
      res.setHeader("Content-Type", path.endsWith(".png") ? "image/png" : "application/json");
      res.setHeader("Cache-Control", current ? "no-cache" : "private, max-age=31536000");
      res.end(readFileSync(path));
      return true;
    }
    if (url.pathname === "/__cartographer/backup-restore" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { file?: unknown; version?: unknown };
      try {
        reply(res, 200, { ok: true, mtime: restoreBackup(options.backupDir, project, String(body.file ?? ""), String(body.version ?? "")) });
      } catch (error) {
        reply(res, 404, { error: (error as Error).message });
      }
      return true;
    }
    if (url.pathname === "/__cartographer/asset-times" && req.method === "POST") {
      // The open pictures' file times (PNG and sidecar), so the app can notice GB Studio (or anything) changing them.
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { assets?: { kind?: unknown; file?: unknown }[] };
      const times = (Array.isArray(body.assets) ? body.assets : []).slice(0, 200).map((asset) => {
        const path = assetPath(project, String(asset.kind ?? ""), String(asset.file ?? ""));
        if (!path) return null;
        return { mtime: statSync(path).mtimeMs, metaMtime: existsSync(`${path}.gbsres`) ? statSync(`${path}.gbsres`).mtimeMs : null };
      });
      reply(res, 200, { ok: true, times });
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-new-asset" && req.method === "POST") {
      const kind = url.searchParams.get("kind") ?? "";
      if (!(ASSET_KINDS as readonly string[]).includes(kind)) {
        reply(res, 400, { error: "Unknown asset kind" });
        return true;
      }
      try {
        reply(res, 200, { ok: true, ...createAsset(project, kind as AssetKind, url.searchParams.get("name") ?? "", await readBody(req)) });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message });
        else throw error;
      }
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-preview-sheet" || url.pathname === "/__cartographer/gbstudio-preview-sheet.png") {
      const kind = url.searchParams.get("kind") ?? "";
      if (!(ASSET_KINDS as readonly string[]).includes(kind)) {
        reply(res, 400, { error: "Unknown asset kind" });
        return true;
      }
      const sheet = previewSheet(project, kind as AssetKind);
      if (url.pathname.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", url.searchParams.get("stamp") === sheet.stamp ? "private, max-age=31536000" : "no-cache");
        res.end(Buffer.from(sheet.png));
      } else reply(res, 200, { ok: true, stamp: sheet.stamp, width: sheet.width, height: sheet.height, cells: sheet.cells });
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-palette-remove" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { id?: unknown };
      try {
        reply(res, 200, { ok: true, ...removePalette(project, String(body.id ?? ""), backup) });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message });
        else throw error;
      }
      return true;
    }
    if (url.pathname === "/__cartographer/maps") {
      // Map Room layouts, kept in GB Cartographer's data folder (beside its settings), not in the project.
      const dataDir = dirname(options.settingsFile);
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString("utf8")) as { maps?: unknown };
        try {
          reply(res, 200, { ok: true, maps: writeMaps(dataDir, project, body.maps) });
        } catch (error) {
          reply(res, 400, { error: (error as Error).message });
        }
      } else reply(res, 200, { ok: true, maps: readMaps(dataDir, project) });
      return true;
    }
    if (url.pathname === "/__cartographer/dialogue-settings") {
      reply(res, 200, { ok: true, ...dialogueSettings(project) });
      return true;
    }
    if (url.pathname === "/__cartographer/project-health") {
      reply(res, 200, { ok: true, ...projectHealth(project) });
      return true;
    }
    if (url.pathname === "/__cartographer/palette-usage") {
      reply(res, 200, { ok: true, palettes: paletteUsage(project) });
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
          const written = writeAsset(path, await readBody(req), backup, expected === null ? null : Number(expected), url.searchParams.get("force") === "1", url.searchParams.get("resize") === "1");
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
      if (url.searchParams.get("backups") === "older" && existsSync(resolve(options.backupDir, "gbstudio"))) {
        revealInFileManager(resolve(options.backupDir, "gbstudio"), false);
        reply(res, 200, { ok: true });
        return true;
      }
      if (url.searchParams.get("backups") === "1") {
        const folder = projectBackupDir(options.backupDir, project);
        mkdirSync(folder, { recursive: true });
        revealInFileManager(folder, false);
        reply(res, 200, { ok: true });
        return true;
      }
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
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { slots?: unknown; priority?: unknown };
      if (!Array.isArray(body.slots) || !body.slots.every((slot) => slot === null || (Number.isInteger(slot) && slot >= 0 && slot <= 7))) {
        reply(res, 400, { error: "slots must be an array of 0–7 or null" });
        return true;
      }
      if (body.priority !== undefined && (!Array.isArray(body.priority) || !body.priority.every((on) => on === null || typeof on === "boolean"))) {
        reply(res, 400, { error: "priority must be an array of true, false or null" });
        return true;
      }
      const expected = url.searchParams.get("metaMtime");
      try {
        const slots = body.slots as (number | null)[], expectedMtime = expected === null ? null : Number(expected), force = url.searchParams.get("force") === "1";
        const written = kind === "sprites" ? writeSpritePalettes(path, slots, backup, expectedMtime, force) : writeTileColors(path, slots, backup, expectedMtime, force, kind as "backgrounds" | "tilesets", (body.priority as (boolean | null)[] | undefined) ?? []);
        reply(res, 200, { ok: true, ...written });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message, mtime: error.mtime });
        else throw error;
      }
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-palette-slot" && req.method === "POST") {
      const kind = url.searchParams.get("kind") ?? "";
      const path = kind === "backgrounds" || kind === "sprites" || kind === "tilesets" ? assetPath(project, kind, url.searchParams.get("file") ?? "") : null;
      if (!path) {
        reply(res, 404, { error: "No such background, tileset or sprite sheet" });
        return true;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { slot?: unknown; paletteId?: unknown; expected?: unknown };
      try {
        reply(res, 200, { ok: true, ...writePaletteSlot(project, kind as AssetKind, path, Number(body.slot), String(body.paletteId ?? ""), backup, typeof body.expected === "string" ? body.expected : undefined) });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message, current: error.current });
        else throw error;
      }
      return true;
    }
    if (url.pathname === "/__cartographer/gbstudio-palette" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { id?: unknown; name?: unknown; colors?: unknown; mtime?: unknown; force?: unknown };
      try {
        const written = writePalette(project, { id: typeof body.id === "string" ? body.id : undefined, name: String(body.name ?? ""), colors: Array.isArray(body.colors) ? body.colors.map(String) : [] }, backup, typeof body.mtime === "number" ? body.mtime : null, body.force === true);
        reply(res, 200, { ok: true, ...written });
      } catch (error) {
        if (error instanceof AssetWriteError) reply(res, error.status, { error: error.message, mtime: error.mtime });
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
