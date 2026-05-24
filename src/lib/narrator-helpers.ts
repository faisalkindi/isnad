// Client-safe narrator helpers. Lives separately from narrator.ts (which
// imports `pg`) so client components can use these without dragging the
// Node-only DB driver into the client bundle.

/** Citation-only entries: grade_ar strings like «ذكره ابن حجر في الإصابة» that
 *  state inclusion in a book without giving a real grade. They are NOT praise
 *  or criticism — they're just attestations of mention. We strip them out of
 *  the "highest praise / harshest criticism" computation and render them as
 *  a neutral "مذكور فقط" tag in the per-book grade table. */
export function isMentionOnly(gradeAr: string | null | undefined): boolean {
  if (!gradeAr) return false;
  return /^(ذكره|ذُكر|ذكر)\s/.test(gradeAr.trim());
}
