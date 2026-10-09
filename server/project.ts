/**
 * Which GB Studio project GB Cartographer is looking at. The desktop app sets it from a folder dialog and remembers it in
 * its settings file; the dev server reads GBC_PROJECT or cartographer.local.json ({ "project": "<folder>" }) next to
 * the repo. A folder counts as a project when it has an assets/ folder (GB Studio 4 layout).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let current: string | null = null;

export function projectFolder(): string | null {
  return current;
}

/** True when the folder looks like a GB Studio project GB Cartographer can read. */
export function isProjectFolder(path: string): boolean {
  return existsSync(resolve(path, "assets")) && existsSync(resolve(path, "project"));
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

export function saveProjectFolder(settingsFile: string, path: string | null) {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
  } catch {
    // A new settings file.
  }
  if (path) settings.project = path;
  else delete settings.project;
  mkdirSync(dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}
