// Client-safe name-formatting helpers used by IsnadDiagram.

/** Pick a recognizable short form of a narrator's nasab — typically how he is
 *  cited inside hadith chains. Examples:
 *    "محمد بن إبراهيم بن الحارث بن خالد بن …"  →  "محمد بن إبراهيم"
 *    "مالك بن أنس بن مالك بن أبي عامر بن …"     →  "مالك بن أنس"
 *  Falls back to the first ~6 word-tokens when the nasab structure doesn't
 *  match the typical "X بن Y بن Z …" pattern. */
export function shortName(fullName: string): string {
  const tokens = fullName.replace(/[،:]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return fullName;
  // FirstName بن FatherName when the second token is بن / بنت
  if (tokens.length >= 3 && (tokens[1] === "بن" || tokens[1] === "بنت")) {
    return `${tokens[0]} ${tokens[1]} ${tokens[2]}`;
  }
  // Otherwise take the first 4 tokens (kunya + name + …)
  return tokens.slice(0, 4).join(" ");
}

/** Pick a single representative death year out of a possibly-compound string
 *  like "119هـ ، أو 120هـ ، أو 121هـ" or "بين 171 هـ و : 180 هـ". Returns the
 *  smallest Hijri year present (the most conservative). */
export function primaryDeathYear(
  death: string | null | undefined,
): { year: string; hasAlternatives: boolean } | null {
  if (!death || death === "-") return null;
  const matches = death.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches
    .map(Number)
    .filter((n) => n > 0 && n < 2000)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  return {
    year: `${nums[0]}هـ`,
    hasAlternatives: nums.length > 1,
  };
}

/** Strip noise from a tabaqat string. Itqan stores things like
 *  "الرابعة" or "من الطبقة الرابعة" — we want just the rank word. */
export function tabaqatShort(tabaqat: string | null | undefined): string | null {
  if (!tabaqat || tabaqat === "-") return null;
  const t = tabaqat.trim();
  // Common pattern: "من الطبقة الرابعة" — take last token
  const m = t.match(/(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|الحادية عشرة|الثانية عشرة)/);
  if (m) return `طبقة ${m[0]}`;
  // Otherwise just truncate
  return t.length > 20 ? t.slice(0, 18) + "…" : t;
}
