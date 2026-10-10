/**
 * The store (2026-10-10): what GB Cartographer ships for people to take into their projects piecemeal, credited.
 * Palettes for now, from the bundled library: each collection is a shelf, cut into sets (a collection of up to
 * eight palettes is one set; a bigger one is cut by name prefix, "DWC-…", "Farm-…", with leftovers in one more set).
 * Collections that name the same `shelf` share it (one set each, named without the shelf's "(…)" credit). Archived
 * names (starting "XX" or "z") stay out.
 */
import library from "../palettes/library.json";

export interface StorePalette { name: string; colors: string[] }
export interface StoreSet { id: string; name: string; about?: string; palettes: StorePalette[] }
export interface StoreShelf { name: string; about?: string; author?: string; license?: string; source?: string; sets: StoreSet[] }

interface Collection { name: string; shelf?: string; about?: string; /** Display names of its sets by name prefix ("DWC" → "Dustwatch Center"). */ sets?: Record<string, string>; author?: string; license?: string; source?: string; palettes: StorePalette[] }

/** A palette name's set: its leading letters ("DWC-1-Cliffs" → "DWC", "Default BG 1" → "Default"). */
const prefixOf = (name: string) => /^[A-Za-z]+/.exec(name)?.[0] ?? "";

export function storeShelves(collections: readonly Collection[] = library.collections): StoreShelf[] {
  const shelves: StoreShelf[] = [];
  for (const collection of collections) {
    const own = collectionShelf(collection);
    if (!own) continue;
    const shared = collection.shelf ? shelves.find((shelf) => shelf.name === collection.shelf) : undefined;
    if (shared) shared.sets.push(...own.sets);
    else shelves.push(collection.shelf ? { ...own, name: collection.shelf, about: undefined } : own);
  }
  return shelves;
}

/** One collection as a shelf of its sets (null when nothing in it is kept). */
function collectionShelf({ name, shelf, about, author, license, source, sets: setNames, palettes }: Collection): StoreShelf | null {
  const kept = palettes.filter((palette) => palette.colors.length === 4 && !/^(XX|z)/.test(palette.name)).map((palette) => ({ name: palette.name, colors: [...palette.colors] }));
  if (!kept.length) return null;
  if (kept.length <= 8) return { name, about, author, license, source, sets: [{ id: name, name: shelf ? name.replace(` (${shelf})`, "") : name, about: shelf ? about : undefined, palettes: kept }] };
  const groups = new Map<string, StorePalette[]>();
  for (const palette of kept) groups.set(prefixOf(palette.name), [...(groups.get(prefixOf(palette.name)) ?? []), palette]);
  const sets: StoreSet[] = [], more: StorePalette[] = [];
  for (const [prefix, members] of groups) {
    if (prefix && members.length >= 2) sets.push({ id: `${name}/${prefix}`, name: setNames?.[prefix] ?? prefix, palettes: members });
    else more.push(...members);
  }
  if (more.length) sets.push({ id: `${name}/more`, name: "More", palettes: more });
  return { name, about, author, license, source, sets };
}

/** Whether the project already has this palette (same name and colors). */
export const hasPalette = (project: readonly StorePalette[], palette: StorePalette) => project.some((item) => item.name === palette.name && item.colors.join().toUpperCase() === palette.colors.join().toUpperCase());

/** What each license on the shelves means, in a sentence, and where its full text is. */
export const LICENSES: Record<string, { text: string; link?: string }> = {
  CC0: { text: "CC0 1.0: no rights reserved. Use, change and share these for anything, commercial games included; no credit needed.", link: "https://creativecommons.org/publicdomain/zero/1.0/" },
  "Public domain": { text: "Released into the public domain by their author: “All palettes are in the public domain and can be used for any purpose.”", link: "https://spicygame.itch.io/palettes" },
  "Free to use": { text: "GB Studio's default greens come from GB Studio (MIT license, by Chris Maltby); the others are common Game Boy screen colors and GB Cartographer's own. Use them anywhere.", link: "https://github.com/chrismaltby/gb-studio/blob/develop/LICENSE" },
};
