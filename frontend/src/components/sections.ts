/**
 * Whether a course's sections mean anything.
 *
 * iGOT lets an author group videos without naming the groups, and most do not
 * bother: 105 courses in the catalogue call their only section "Course videos",
 * and others number them - "Videos 1-5", "Videos 6-10". A heading that only
 * repeats the position of what is under it is worse than no heading: it adds a
 * row to read, a thing to collapse, and says nothing. Where every section is
 * one of those, the videos simply flow as one list.
 */
const PLACEHOLDER =
  /^(?:videos?|sections?|modules?|parts?|units?|chapters?|lessons?)\s*\d*(?:\s*[-–—]\s*\d+)?\.?$|^course\s+videos?$|^untitled/i;

export function isPlaceholderSection(title: string): boolean {
  return !title.trim() || PLACEHOLDER.test(title.trim());
}

/** The section titles worth showing - none, when they are all placeholders. */
export function realSections(titles: string[]): string[] {
  const real = titles.filter((title) => !isPlaceholderSection(title));
  return real.length >= 2 || (real.length === 1 && titles.length === 1) ? real : [];
}
