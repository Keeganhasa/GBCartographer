/**
 * Backups that keep history. Before GB Cartographer overwrites a project file, the old file is copied to
 *   <backupDir>/<project key>/<path inside the project>/<time>.<ext>
 * The project key is the folder's name plus a short hash of its full path, so two projects with an
 * `assets/sprites/player.png` never share backups. The newest KEEP versions of each file are kept.
 * A restore first backs up the file it replaces, so a restore can be undone the same way.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

export const KEEP = 10;

export interface BackupVersion { id: string; time: number; size: number }
export interface BackupFile { file: string; versions: BackupVersion[] }

/** The folder holding one project's backups. */
export function projectBackupDir(backupDir: string, project: string): string {
  const full = resolve(project);
  const name = basename(full).replace(/[^A-Za-z0-9 _.-]/g, "_").slice(0, 40) || "project";
  return join(backupDir, `${name}-${createHash("sha1").update(full).digest("hex").slice(0, 8)}`);
}

/** A project file's path inside the project, with forward slashes; null when it is outside the project. */
function inside(project: string, path: string): string | null {
  const rel = relative(resolve(project), resolve(path));
  if (!rel || rel.startsWith("..") || resolve(project, rel) !== resolve(path)) return null;
  return rel.split(sep).join("/");
}

/** A version id from a time: sortable and safe as a file name (2026-10-09T23-12-05-123Z). */
function versionId(time: number): string {
  return new Date(time).toISOString().replace(/[:.]/g, "-");
}

function versions(folder: string): BackupVersion[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => /^\d{4}-\d\d-\d\dT[\d-]+Z(-\d+)?(\.[^.]+)?$/.test(name))
    .map((name) => {
      const stat = statSync(join(folder, name));
      const time = Date.parse(name.replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z.*$/, "$1:$2:$3.$4Z"));
      return { id: name, time: Number.isFinite(time) ? time : stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Copies a project file to its backup folder before it is overwritten (nothing to do when it does not exist yet)
 * and drops versions beyond the newest KEEP. Returns the backup's path, or null.
 */
export function backupFile(backupDir: string, project: string, path: string): string | null {
  const rel = inside(project, path);
  if (!rel || !existsSync(path)) return null;
  const folder = join(projectBackupDir(backupDir, project), ...rel.split("/"));
  mkdirSync(folder, { recursive: true });
  const ext = extname(path);
  let id = `${versionId(Date.now())}${ext}`;
  for (let n = 2; existsSync(join(folder, id)); n += 1) id = `${versionId(Date.now())}-${n}${ext}`;
  const target = join(folder, id);
  copyFileSync(path, target);
  for (const old of versions(folder).slice(KEEP)) rmSync(join(folder, old.id), { force: true });
  return target;
}

/** Every backed-up file of a project (newest version first), or just `file` (a path inside the project). */
export function listBackups(backupDir: string, project: string, file?: string): BackupFile[] {
  const root = projectBackupDir(backupDir, project);
  if (!existsSync(root)) return [];
  const found: BackupFile[] = [];
  const walk = (folder: string) => {
    const entries = readdirSync(folder, { withFileTypes: true });
    const list = versions(folder);
    if (list.length) found.push({ file: relative(root, folder).split(sep).join("/"), versions: list });
    for (const entry of entries) if (entry.isDirectory()) walk(join(folder, entry.name));
  };
  if (file) {
    const folder = join(root, ...file.split("/"));
    const list = existsSync(folder) && !file.split("/").includes("..") ? versions(folder) : [];
    return list.length ? [{ file, versions: list }] : [];
  }
  walk(root);
  return found.sort((a, b) => b.versions[0].time - a.versions[0].time);
}

/** The path of one backed-up version, or null when there is no such version. */
export function backupPath(backupDir: string, project: string, file: string, version: string): string | null {
  if (file.split("/").includes("..") || !/^[\w.-]+$/.test(version)) return null;
  const path = join(projectBackupDir(backupDir, project), ...file.split("/"), version);
  return existsSync(path) ? path : null;
}

/**
 * Puts a backed-up version back in the project: the current file is backed up first (so the restore can be
 * undone), then replaced through a temporary file. Returns the restored file's new modification time.
 */
export function restoreBackup(backupDir: string, project: string, file: string, version: string): number {
  const source = backupPath(backupDir, project, file, version);
  const target = resolve(project, ...file.split("/"));
  if (!source || !inside(project, target)) throw new Error("No such backup");
  // The version is copied out before the current file is backed up: that backup may push the oldest version out.
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.restoring`;
  copyFileSync(source, temp);
  backupFile(backupDir, project, target);
  try {
    renameSync(temp, target);
  } catch {
    copyFileSync(temp, target);
    try { unlinkSync(temp); } catch { /* nothing more to do */ }
  }
  return statSync(target).mtimeMs;
}
