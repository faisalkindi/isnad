import { query } from "../db";
import { normalizeArabic } from "../normalize";

export interface NarratorCandidate {
  id: number;
  full_name: string;
  /** Itqan's consensus grade. */
  grade_en: string | null;
  grade_ar: string | null;
  /** The HARSHEST single grading found across all 22 books for this narrator
   *  (excluding citation-only entries and "unknown"). Used as the effective
   *  grade per the app's conservative "always apply the harshest jarh" rule —
   *  classical: «الجرح المفسَّر مقدَّم على التعديل». */
  harshest_grade_en: string | null;
  /** The Arabic phrase that yielded `harshest_grade_en`, with its book key,
   *  so the UI can show "the harshest critic said «X» in book Y". */
  harshest_grade_ar: string | null;
  harshest_source_book: string | null;
  tabaqat: string | null;
  death: string | null;
  /** Ibn Hajar's Mudallisīn tier (1–5), or null if not on the list. */
  tadlis_tier: number | null;
  /** TRUE if known as a practitioner of تدليس التسوية (the worst form). */
  practices_taswiya: boolean;
  /** Combined Itqan city + AR-Sanad cities overlay, comma-separated. */
  cities: string | null;
  /** Per-source rijāl verdicts (e.g., from Dāraquṭnī's موسوعة). Each entry
   *  is one explicit citation by a named scholar; UI surfaces these next to
   *  the consensus / harshest grade. */
  source_verdicts: SourceVerdict[];
  /** Top شيوخ (teachers) for this narrator, sourced from Itqan's transmission
   *  graph. Sorted by prominence (how widely each is documented). Limited to
   *  20 entries to keep payload bounded. */
  top_teachers: NarratorMiniRef[];
  /** Top تلامذة (students). Same shape as teachers. */
  top_students: NarratorMiniRef[];
  score: number;
}

export interface NarratorMiniRef {
  id: number;
  full_name: string;
  grade_en: string | null;
  grade_ar: string | null;
  death: string | null;
  /** Books that attest this teacher-student edge (intersection of both
   *  narrators' classical_sources). */
  source_books: string[];
}

export interface SourceVerdict {
  /** Display label for the scholar whose verdict this is (e.g. "الدارقطني"). */
  author_ar: string;
  /** Internal identifier for the source book the verdict came from. */
  source_book: string;
  /** The verdict text, verbatim. */
  verdict_ar: string;
  /** Who relayed this verdict (if applicable). */
  relayed_via: string | null;
  /** Page reference in the source. */
  page_ref: string | null;
}

interface CandidateRow extends NarratorCandidate {
  prominence: number;
}

// Tier order used for "harshest" picking — lower number = harsher.
// Excluded:
//   - citation-only grade_ar (e.g. «ذكره ابن حجر في الإصابة»)
//   - jarh-tier rows for Companions (Companions are عدول by classical
//     consensus; jarh against them is parser noise from al-Iṣāba etc.).
//     Companion detection now uses THREE signals:
//       * narrator.tabaqat = 'صحابي' (most reliable — the narrator table
//         field is set by the Itqan import directly)
//       * source_grade.grade_en = 'companion'
//       * grade_ar regex for "صحبة", "أدرك النبي", "العشرة"
//   - weak-rated rows from "catalog" books (dhayl_diwan, diwan_ducafa,
//     mughni_ducafa) WHEN the narrator has a non-weak grade in any of
//     the AUTHORITATIVE comprehensive books (taqrib, tahdhib_tahdhib,
//     tahdhib_kamal). Those catalogs index "narrators discussed" — being
//     listed there does not equal a jarḥ verdict, but the Itqan parser
//     classified mere inclusion as 'weak'. When Ibn Ḥajar's Taqrīb
//     (definitive consensus verdict) disagrees, trust the comprehensive
//     source.
const HARSHEST_SUBQUERY = `(
  SELECT row_to_json(sg) FROM (
    SELECT grade_en, grade_ar, source_book FROM source_grade
    WHERE narrator_id = n.id
      AND grade_en IS NOT NULL
      AND grade_en <> 'unknown'
      AND (grade_ar IS NULL OR grade_ar !~ '^(ذكره|ذُكر|ذكر) ')
      -- (Trust-list override removed per user direction 2026-05-25: the
      -- explicit policy is «دائمًا أشدّ جرحٍ متاح» — always surface the
      -- harshest jarh in our DB, even when it looks like parser noise.
      -- Cleaning the underlying source_grade rows is a separate problem;
      -- code should not hide them.)
      -- Companion carve-out (signals from THREE fields)
      AND NOT (
        grade_en IN ('weak','abandoned','fabricator','mostly_reliable')
        AND (
          n.tabaqat ~ '(صحاب|العشرة)'
          OR EXISTS (
            SELECT 1 FROM source_grade sg2
            WHERE sg2.narrator_id = n.id
              AND (
                sg2.grade_en = 'companion'
                OR sg2.grade_ar ~ '(صحاب|صحبة|له صحبة|أدرك النبي)'
              )
          )
        )
      )
      -- (All catalog / biographical / consensus carve-outs removed
      -- 2026-05-25 per user policy: "always apply the harshest jarh
      -- available." The DB content is the canonical source of truth.
      -- If the data has parser noise that's a separate problem — code
      -- should NOT hide it.)
    ORDER BY
      CASE grade_en
        WHEN 'fabricator'      THEN 0
        WHEN 'abandoned'       THEN 1
        WHEN 'weak'            THEN 2
        WHEN 'mostly_reliable' THEN 4
        WHEN 'reliable'        THEN 5
        WHEN 'companion'       THEN 6
        ELSE 3
      END ASC,
      length(grade_ar) DESC
    LIMIT 1
  ) sg
)`;

/**
 * Find narrator candidates for a (possibly partial) name, using trigram
 * similarity over the normalized name-variant index.
 *
 * Ranked by trigram similarity; ties at the top score (common for short
 * names) are broken by "prominence" — how many of the 22 classical texts
 * cover the narrator — so a well-documented narrator surfaces ahead of an
 * obscure namesake. The LLM disambiguator then picks using the chain context.
 * Recall on very common bare first-names is imperfect; see the matching-
 * accuracy risk in the design doc (the correction UI is the user's fallback).
 */
export async function findCandidates(
  nameQuery: string,
  limit = 12,
): Promise<NarratorCandidate[]> {
  const normalized = normalizeArabic(nameQuery);
  if (normalized.length === 0) return [];

  // COALESCE pulls in the AR-Sanad death_overlay when Itqan's `death` is null —
  // see migration 003 and scripts/import-arsanad-deaths.ts.
  const res = await query<
    CandidateRow & {
      cities: string | null;
      practices_taswiya: boolean | null;
      harshest: { grade_en: string; grade_ar: string; source_book: string } | null;
      source_verdicts: SourceVerdict[] | null;
    }
  >(
    `SELECT n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat,
            COALESCE(NULLIF(n.death, '-'), n.death_overlay) AS death,
            n.tadlis_tier,
            COALESCE(n.practices_taswiya, false) AS practices_taswiya,
            NULLIF(
              trim(both '، ' FROM
                COALESCE(NULLIF(n.city, '-'), '') || '، ' ||
                COALESCE(n.cities_overlay, '')
              ),
              ''
            ) AS cities,
            ${HARSHEST_SUBQUERY} AS harshest,
            -- Pull verdicts from BOTH tables. narrator_grade_source carries
            -- the structured per-quote rows imported per rijal book (currently
            -- the موسوعة الدارقطني -- has named relayer + page ref). source_grade
            -- carries the older per-narrator-per-book single grading we
            -- imported from Itqan 22 sources. UI treats them uniformly
            -- and groups by author. We filter out empty grade_ar rows
            -- from source_grade -- they appear when a book mentions a narrator
            -- but does not grade him, and would be noise in the UI.
            -- Top 20 شيوخ (teachers): for THIS narrator (as student), the
            -- teachers he heard from. Sorted by how widely each teacher is
            -- documented (prominence proxy = source_grade row count).
            (
              SELECT json_agg(t ORDER BY (t->>'prom')::int DESC)
              FROM (
                SELECT json_build_object(
                  'id',           tn.id,
                  'full_name',    tn.full_name,
                  'grade_en',     tn.grade_en,
                  'grade_ar',     tn.grade_ar,
                  'death',        COALESCE(NULLIF(tn.death, '-'), tn.death_overlay),
                  'source_books', COALESCE(tr.source_books, '{}'::text[]),
                  'prom',         (SELECT count(*) FROM source_grade sg2
                                    WHERE sg2.narrator_id = tn.id)
                ) AS t
                FROM transmission tr
                JOIN narrator tn ON tn.id = tr.teacher_id
                WHERE tr.student_id = n.id
                ORDER BY (SELECT count(*) FROM source_grade sg2
                          WHERE sg2.narrator_id = tn.id) DESC
                LIMIT 20
              ) top_t
            ) AS top_teachers,
            -- Top 20 تلامذة (students): for THIS narrator (as teacher), the
            -- students who narrated from him.
            (
              SELECT json_agg(s ORDER BY (s->>'prom')::int DESC)
              FROM (
                SELECT json_build_object(
                  'id',           sn.id,
                  'full_name',    sn.full_name,
                  'grade_en',     sn.grade_en,
                  'grade_ar',     sn.grade_ar,
                  'death',        COALESCE(NULLIF(sn.death, '-'), sn.death_overlay),
                  'source_books', COALESCE(tr.source_books, '{}'::text[]),
                  'prom',         (SELECT count(*) FROM source_grade sg2
                                    WHERE sg2.narrator_id = sn.id)
                ) AS s
                FROM transmission tr
                JOIN narrator sn ON sn.id = tr.student_id
                WHERE tr.teacher_id = n.id
                ORDER BY (SELECT count(*) FROM source_grade sg2
                          WHERE sg2.narrator_id = sn.id) DESC
                LIMIT 20
              ) top_s
            ) AS top_students,
            (
              SELECT json_agg(v ORDER BY (v->>'sort_idx')::int, (v->>'order')::int) FROM (
                SELECT json_build_object(
                  'author_ar',  ngs.author_ar,
                  'source_book', ngs.source_book,
                  'verdict_ar', ngs.verdict_ar,
                  'relayed_via', ngs.relayed_via,
                  'page_ref',   ngs.page_ref,
                  'sort_idx',   0,
                  'order',      ngs.id
                ) AS v
                FROM narrator_grade_source ngs
                WHERE ngs.narrator_id = n.id
                UNION ALL
                SELECT json_build_object(
                  'author_ar',  '',
                  'source_book', sg.source_book,
                  'verdict_ar', sg.grade_ar,
                  'relayed_via', NULL,
                  'page_ref',   NULL,
                  'sort_idx',   1,
                  'order',      sg.id
                ) AS v
                FROM source_grade sg
                WHERE sg.narrator_id = n.id
                  AND sg.grade_ar IS NOT NULL
                  AND length(trim(sg.grade_ar)) > 0
              ) all_verdicts
            ) AS source_verdicts,
            max(similarity(nv.normalized_variant, $1)) AS score,
            (SELECT count(*) FROM source_grade sg WHERE sg.narrator_id = n.id)
              AS prominence
     FROM name_variant nv
     JOIN narrator n ON n.id = nv.narrator_id
     WHERE nv.normalized_variant % $1
     GROUP BY n.id, n.full_name, n.grade_en, n.grade_ar, n.tabaqat, n.death, n.death_overlay, n.tadlis_tier, n.practices_taswiya, n.city, n.cities_overlay
     ORDER BY score DESC, prominence DESC
     LIMIT $2`,
    [normalized, limit],
  );

  return res.rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    grade_en: r.grade_en,
    grade_ar: r.grade_ar,
    harshest_grade_en: r.harshest?.grade_en ?? null,
    harshest_grade_ar: r.harshest?.grade_ar ?? null,
    harshest_source_book: r.harshest?.source_book ?? null,
    tabaqat: r.tabaqat,
    death: r.death,
    tadlis_tier: r.tadlis_tier,
    practices_taswiya: r.practices_taswiya === true,
    cities: r.cities,
    source_verdicts: r.source_verdicts ?? [],
    top_teachers: (r as { top_teachers?: NarratorMiniRef[] | null }).top_teachers ?? [],
    top_students: (r as { top_students?: NarratorMiniRef[] | null }).top_students ?? [],
    score: Number(r.score),
  }));
}
