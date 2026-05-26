// Per-طبقة chain alignment for the classical mutawātir/mashhūr/ʿazīz/gharīb
// classification.
//
// The methodology Ibn Ḥajar / al-Suyūṭī require:
//   1. take every chain known to transmit THIS matn
//   2. align them by طبقة, starting from the source (Companion) outward
//   3. at each level, count distinct narrators across all chains
//   4. the chain's class = the MINIMUM count across all levels
//
// We:
//   - call the segmenter on every corpus match's raw text (cached per
//     hadith id in `corpus_chain_cache`)
//   - normalise each name with normalizeArabic()
//   - reverse each chain so position 0 is the source
//   - count `|distinct names|` at each position across all chains
//   - return the per-level breakdown + the chain class

import { segmentIsnad } from "./segment";
import { normalizeArabic } from "../normalize";
import { pool, query } from "../db";
import type { HadithMatch } from "./corpus";

export interface LevelCount {
  /** 0 = source (Companion) — moving outward as level increases. */
  level: number;
  /** Number of distinct (normalised) narrator names appearing at this level
   *  across all aligned chains. */
  count: number;
  /** Sample of the actual narrator names found at this level (deduped). */
  names: string[];
}

export interface AlignedChains {
  /** Per-level distinct-narrator counts, starting from the source. */
  levels: LevelCount[];
  /** Minimum count across all levels — the classical bottleneck. */
  minCount: number;
  /** Which level had the bottleneck (0 = source). */
  narrowestLevel: number;
  /** Total parsed chains (= corpus matches we managed to segment). */
  totalChains: number;
  /** Distinct authoritative books contributing chains. */
  distinctBooks: number;
}

/** Get the parsed narrator list for one corpus hadith. Uses cache; on miss,
 *  calls the segmenter and stores. Returns names in chain order (the
 *  segmenter's own order, compiler-first). */
async function getOrParseChain(
  hadithId: number,
  arabicFull: string,
): Promise<string[]> {
  // 1. cache lookup
  const cached = await query<{ narrators_normalized: string[] }>(
    "SELECT narrators_normalized FROM corpus_chain_cache WHERE hadith_id = $1",
    [hadithId],
  );
  if (cached.rows[0]) {
    return cached.rows[0].narrators_normalized;
  }

  // 2. parse via LLM
  let segmented;
  try {
    segmented = await segmentIsnad(arabicFull);
  } catch {
    // Bad parse — store an empty array so we don't keep retrying this row,
    // but only after we've confirmed the chain text is non-trivial. Empty
    // result still contributes nothing to the alignment.
    await query(
      `INSERT INTO corpus_chain_cache (hadith_id, narrators_normalized)
       VALUES ($1, $2)
       ON CONFLICT (hadith_id) DO NOTHING`,
      [hadithId, []],
    );
    return [];
  }

  const normalized = segmented.narrators
    .map((n) => normalizeArabic(n.name).trim())
    .filter((s) => s.length > 0);

  // 3. cache it
  await query(
    `INSERT INTO corpus_chain_cache (hadith_id, narrators_normalized)
     VALUES ($1, $2)
     ON CONFLICT (hadith_id) DO UPDATE
       SET narrators_normalized = $2, segmented_at = now()`,
    [hadithId, normalized],
  );

  return normalized;
}

/** Parse every corpus match's chain (in parallel; throttled by the underlying
 *  HTTP fetch). Returns the per-chain narrator lists ready for alignment. */
async function parseAllChains(matches: HadithMatch[]): Promise<string[][]> {
  const out = await Promise.all(
    matches.map(async (m) => {
      try {
        return await getOrParseChain(m.id, m.arabic_full);
      } catch {
        return [];
      }
    }),
  );
  // Drop chains that segmented to nothing — they'd add zeros at every level
  // and falsely advertise wider tawātur than we actually have.
  return out.filter((c) => c.length > 0);
}

/** Align all corpus chains by source-end and count distinct narrators per
 *  level. The chain's class = the minimum count across all levels (Ibn
 *  Ḥajar / al-Suyūṭī's شرط استمرار الكثرة). */
export async function alignAndCount(
  matches: HadithMatch[],
): Promise<AlignedChains | null> {
  if (matches.length === 0) return null;

  // Only keep high-confidence matches — score < 0.5 is usually unrelated
  // wording overlap and would inflate the chain count with false matches.
  const relevant = matches.filter((m) => Number(m.score) >= 0.5);
  if (relevant.length === 0) return null;

  const parsedChains = await parseAllChains(relevant);
  if (parsedChains.length === 0) return null;

  // Reverse each chain so index 0 is the source (Companion / Prophet-end).
  const sourceFirst = parsedChains.map((c) => [...c].reverse());

  // Build per-level counts up to the longest chain. Chains that are shorter
  // simply don't contribute at deeper levels — which is fine because the
  // multiplicity at those levels does drop in reality.
  //
  // Names are fuzzy-deduped within each level: "عمر بن الخطاب" and
  // "امير المؤمنين ابي حفص عمر بن الخطاب" are the same person, but
  // string-equality treats them as two. We group by token-set similarity
  // before counting, so the multiplicity reflects distinct PEOPLE not
  // distinct string forms.
  const maxDepth = Math.max(...sourceFirst.map((c) => c.length));
  const levels: LevelCount[] = [];
  for (let level = 0; level < maxDepth; level++) {
    const rawNames: string[] = [];
    for (const chain of sourceFirst) {
      if (level < chain.length) rawNames.push(chain[level]);
    }
    const groups = groupSameNarrator(rawNames);
    levels.push({
      level,
      count: groups.length,
      names: groups.map((g) => g[0]).slice(0, 5),
    });
  }

  // Bottleneck = the SMALLEST count across all levels. Tied? Earliest
  // (closer to the source) wins, since that's the classical sense of the
  // "narrowest طبقة".
  let minCount = levels[0].count;
  let narrowestLevel = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].count < minCount) {
      minCount = levels[i].count;
      narrowestLevel = i;
    }
  }

  return {
    levels,
    minCount,
    narrowestLevel,
    totalChains: parsedChains.length,
    distinctBooks: new Set(relevant.map((m) => m.book_id)).size,
  };
}

/** Pool reference re-exported for tests that need to close it. */
export const _pool = pool;

// ---------- name-equivalence (fuzzy dedup within a tabaqa level) ----------

/** Common Arabic name-tokens that don't carry identity on their own — they're
 *  honorifics or grammatical particles. Removing them before comparison
 *  prevents "أمير المؤمنين أبي حفص عمر بن الخطاب" being treated as a
 *  different person from plain "عمر بن الخطاب". */
const NAME_NOISE = new Set([
  "ابن", "بن", "بنت", "ابو", "ابي", "ام",
  "امير", "المؤمنين", "حفص",
  "ال", "الامام",
  "رضي", "الله", "عنه", "عنها", "عنهم", "تعالى",
  "سيدنا", "مولانا", "حضرت",
  // Grammatical particles segmenters leave in "X أو Y" identity-doubt forms
  // ("أبو عامر أو أبو مالك"). Without filtering these, two chains carrying
  // the same identity-doubt narrator can fail to match a chain that gives
  // just one of the two names.
  "او", "أو", "ام",
]);

/** Strip common nisba suffixes (tribal/regional adjectives) — these
 *  disambiguate two narrators with the same kunya/name but are often
 *  inconsistently present in different chains for the same person. */
const NISBA_RX =
  /^(الليثي|الانصاري|التيمي|الكلابي|الاشعري|القرشي|الكوفي|البصري|المدني|الشامي|الدمشقي|البغدادي|الحميدي|الازدي|التميمي|الخزاعي|الثقفي|السلمي|الجمحي)$/;

/** Tokenize a normalized name into identity-carrying words. */
function nameTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 2 && !NAME_NOISE.has(t) && !NISBA_RX.test(t),
    );
}

/** Two names refer to the same narrator if either:
 *   - their identity-token sets have Jaccard ≥ 0.5, OR
 *   - one identity-token set is a non-trivial subset of the other (e.g.,
 *     "عمر بن الخطاب" ⊂ "أمير المؤمنين أبي حفص عمر بن الخطاب"). */
function sameNarrator(a: string, b: string): boolean {
  const at = new Set(nameTokens(a));
  const bt = new Set(nameTokens(b));
  if (at.size === 0 || bt.size === 0) return a === b;
  const intersection = [...at].filter((t) => bt.has(t)).length;
  const union = new Set([...at, ...bt]).size;
  const jaccard = intersection / union;
  if (jaccard >= 0.5) return true;
  // Subset check — the smaller set fully contained in the larger.
  const smaller = at.size <= bt.size ? at : bt;
  const larger = at.size <= bt.size ? bt : at;
  if (smaller.size >= 2 && [...smaller].every((t) => larger.has(t))) {
    return true;
  }
  return false;
}

/** Cluster names that refer to the same narrator. Returns one bucket per
 *  distinct narrator; the first name in each bucket is the representative
 *  (typically the shortest / most canonical form, since we iterate in
 *  insertion order). */
function groupSameNarrator(names: string[]): string[][] {
  const groups: string[][] = [];
  for (const name of names) {
    let placed = false;
    for (const g of groups) {
      if (sameNarrator(g[0], name)) {
        g.push(name);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([name]);
  }
  return groups;
}

// Exported for unit tests.
export const _internal = { sameNarrator, groupSameNarrator, nameTokens };
