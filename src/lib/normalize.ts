// Arabic name normalization for matching.
//
// Folding rules follow CAMeL Tools' DEFAULT_NORMALIZE_MAP (verified):
//   - remove tatweel (kashida) and tashkeel (diacritics)
//   - alif forms  أ إ آ ٱ  -> bare alif  ا
//   - alif maqsura  ى  -> ya  ي
//   - ta marbuta  ة  -> ha  ه
//
// The SAME function must run at data-import time and at query time, so that
// the stored index and an incoming search term normalize identically.
// Every folding rule is covered by a test in normalize.test.ts.

// U+0610-061A Quranic honorifics, U+064B-065F harakat/tanwin/shadda/sukun,
// U+0670 superscript alef, U+0640 tatweel.
const STRIP = /[ؐ-ًؚ-ٰٟـ]/g;

const LETTER_FOLD: Record<string, string> = {
  "أ": "ا", // أ -> ا
  "إ": "ا", // إ -> ا
  "آ": "ا", // آ -> ا
  "ٱ": "ا", // ٱ -> ا
  "ى": "ي", // ى -> ي
  "ة": "ه", // ة -> ه
};
const FOLD = /[أإآٱىة]/g;

/** Normalize an Arabic name for indexing and matching. */
export function normalizeArabic(input: string): string {
  return input
    .normalize("NFC")
    .replace(STRIP, "")
    .replace(FOLD, (ch) => LETTER_FOLD[ch] ?? ch)
    .replace(/\s+/g, " ")
    .trim();
}
