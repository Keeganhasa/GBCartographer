/**
 * Which GB Studio project GB Cartographer is looking at. The desktop app sets it from a folder dialog and remembers it in
 * its settings file; the dev server reads GBC_PROJECT or cartographer.local.json ({ "project": "<folder>" }) next to
 * the repo. A folder counts as a project when it has an assets/ folder (GB Studio 4 layout).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The GB Studio versions GB Cartographer was tested with (major.minor). */
export const TESTED_GB_STUDIO = ["4.2"];

let current: string | null = null;

export function projectFolder(): string | null {
  return current;
}

/** The `_version` in the folder's .gbsproj (e.g. "4.2.0"), or null. */
export function projectVersion(path: string): string | null {
  try {
    const file = readdirSync(path).find((name) => name.toLowerCase().endsWith(".gbsproj"));
    const version = file ? (JSON.parse(readFileSync(resolve(path, file), "utf8")) as { _version?: unknown })._version : null;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Why a folder can't be opened, in words for the user, or null when it can. A GB Studio 3 project keeps
 * everything in its .gbsproj (no project/ folder); GB Studio 4 converts it when it opens and saves it.
 */
export function projectProblem(path: string): string | null {
  if (isProjectFolder(path)) return null;
  const gbsproj = existsSync(path) && readdirSync(path).some((name) => name.toLowerCase().endsWith(".gbsproj"));
  if (gbsproj && existsSync(resolve(path, "assets"))) {
    const version = projectVersion(path);
    return `This looks like a GB Studio 3 project${version ? ` (${version})` : ""}: everything is in its .gbsproj file. GB Cartographer reads GB Studio 4 projects. Open it in GB Studio 4 and save once (GB Studio converts it; keep a copy first), then open it here.`;
  }
  return "That folder is not a GB Studio project (it needs assets/ and project/ folders).";
}

/**
 * A note when the project was made with a GB Studio version GB Cartographer wasn't tested with, or null.
 */
export function versionNote(path: string): string | null {
  const version = projectVersion(path);
  if (!version) return null;
  const [major, minor] = version.split(".");
  if (TESTED_GB_STUDIO.includes(`${major}.${minor}`)) return null;
  if (major !== "4") return `This project was made with GB Studio ${version}; GB Cartographer was tested with GB Studio ${TESTED_GB_STUDIO.join(", ")}. Keep a backup and check pictures in GB Studio after saving.`;
  return `Made with GB Studio ${version} (tested with ${TESTED_GB_STUDIO.join(", ")}). Files should read the same; check the first save in GB Studio.`;
}

/** True when the folder looks like a GB Studio project GB Cartographer can read. */
export function isProjectFolder(path: string): boolean {
  return existsSync(resolve(path, "assets")) && existsSync(resolve(path, "project"));
}

/** A picked path as a project folder: a .gbsproj file stands for the folder it is in. */
export function projectFolderFor(path: string): string {
  const resolved = resolve(path.trim());
  return /\.gbsproj$/i.test(resolved) ? dirname(resolved) : resolved;
}

export function setProjectFolder(path: string | null) {
  current = path ? resolve(path) : null;
}

function readSetting(file: string): string | null {
  try {
    const value = (JSON.parse(readFileSync(file, "utf8")) as { project?: unknown }).project;
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

/** Picks the project from the environment, then the settings file; a folder that is no longer a project is ignored. */
export function loadProjectFolder(root: string, settingsFile = resolve(root, "cartographer.local.json")): string | null {
  const candidates = [process.env.GBC_PROJECT, readSetting(settingsFile)];
  for (const candidate of candidates) {
    if (candidate && isProjectFolder(resolve(root, candidate))) {
      setProjectFolder(resolve(root, candidate));
      return current;
    }
  }
  return current;
}

/**
 * The demo project that ships with the app (`<root>/demo`), copied next to the settings file the first time it is
 * opened, so painting in it never touches the shipped copy. Returns the copy's folder, or null without a demo.
 */
export function demoProjectCopy(root: string, settingsFile: string): string | null {
  const source = resolve(root, "demo");
  if (!isProjectFolder(source)) return null;
  const copy = resolve(dirname(settingsFile), "demo-project");
  if (!existsSync(copy)) cpSync(source, copy, { recursive: true });
  return copy;
}

function readSettings(settingsFile: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Remembers the open project and keeps the last six project folders as "recent" (newest first). */
export function saveProjectFolder(settingsFile: string, path: string | null) {
  const settings = readSettings(settingsFile);
  if (path) {
    settings.project = path;
    const recent = (Array.isArray(settings.recent) ? settings.recent as unknown[] : []).filter((entry): entry is string => typeof entry === "string" && entry !== path);
    settings.recent = [path, ...recent].slice(0, 6);
  } else delete settings.project;
  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

/** The recent project folders that still exist, newest first. */
export function recentProjects(settingsFile: string): string[] {
  const recent = readSettings(settingsFile).recent;
  return (Array.isArray(recent) ? recent as unknown[] : []).filter((entry): entry is string => typeof entry === "string" && isProjectFolder(entry));
}
