/**
 * Which GB Studio GB Cartographer follows: always the newest release. A project's .gbsproj carries GB Studio's file
 * format (`_version` and `_release`); GB Studio migrates older projects when it opens them, so GB Cartographer only
 * needs to read the newest format.
 *
 * When GB Studio releases: read its notes and its project migrations (the last `migrate…` in app.asar gives the
 * newest format), check the files GB Cartographer reads and writes, then bump these and the README's table.
 */
export const GB_STUDIO = {
  /** The newest GB Studio release, checked against. */
  latest: "4.3.2",
  /** The oldest GB Studio release that writes the same format. */
  oldest: "4.2.0",
  /** The project format those releases write. */
  format: { version: "4.2.0", release: 10 },
} as const;

/** Compares plain dotted versions (4.2.0): negative when a is older than b. */
function compareDotted(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let at = 0; at < Math.max(pa.length, pb.length); at += 1) {
    const diff = (pa[at] || 0) - (pb[at] || 0);
    if (diff) return diff;
  }
  return 0;
}

/** A note for a project whose format isn't the one GB Cartographer follows, or null when it is. */
export function formatNote(version: string, release: number | null): string | null {
  const { format, latest } = GB_STUDIO;
  const order = compareDotted(version, format.version) || (release == null ? 0 : release - format.release);
  if (order === 0) return null;
  const shown = `${version}${release == null ? "" : ` r${release}`}`;
  if (order > 0) return `This project was saved by a newer GB Studio than GB Cartographer knows (file format ${shown}; GB Cartographer follows GB Studio ${latest}). Look for a GB Cartographer update, and keep a backup until then.`;
  return `This project is in an older GB Studio file format (${shown}). GB Cartographer follows the newest GB Studio (${latest}): open the project in it and save once (keep a copy first), then open it here.`;
}
