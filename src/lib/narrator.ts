import { query } from "./db";
import { gradeTier } from "./grades";
import { isMentionOnly } from "./narrator-helpers";
export { isMentionOnly } from "./narrator-helpers";

export interface SourceGrade {
  source_book: string;
  entry_id: number | null;
  grade_en: string | null;
  grade_ar: string | null;
}

/** Cross-book grade-disagreement summary for one narrator. */
export interface DisagreementSummary {
  /** How many distinct grade_en buckets show up across books (excluding null/unknown). */
  distinctGrades: number;
  /** Range of tiers (max - min) — bigger = more dramatic disagreement. */
  tierSpread: number;
  /** The most-positive grading we have, with its book. */
  highest: SourceGrade | null;
  /** The most-negative grading we have, with its book. */
  lowest: SourceGrade | null;
}

export interface NarratorDetail {
  id: number;
  full_name: string;
  kunya: string | null;
  laqab: string | null;
  nasab: string | null;
  grade_en: string | null;
  grade_ar: string | null;
  death: string | null;
  tabaqat: string | null;
  city: string | null;
  itqan_confidence: string | null;
  nameVariants: string[];
  sourceGrades: SourceGrade[];
  /** Same rows as sourceGrades, sorted by tier descending (praise → criticism). */
  sortedSourceGrades: SourceGrade[];
  disagreement: DisagreementSummary;
  teacherIds: number[];
  studentIds: number[];
}

function computeDisagreement(
  grades: SourceGrade[],
  opts: { isCompanion?: boolean } = {},
): DisagreementSummary {
  // Classical principle: «الصحابة كلّهم عدول». Companions are not subject to
  // jarh. Either the caller passed `isCompanion` (preferred — uses narrator
  // tabaqat which is the canonical signal), or we infer from the grades.
  const isCompanion =
    opts.isCompanion ??
    grades.some(
      (g) =>
        g.grade_en === "companion" ||
        (g.grade_ar && /صحاب|صحبة|له\s+صحبة|أدرك\s+النبي/.test(g.grade_ar)),
    );

  // User policy: surface the harshest jarh available. We do NOT suppress
  // weak/abandoned/fabricator rows for trust-list narrators — if the DB
  // has the grade, we show it.

  // Only consider rows with a real, opinionated grade — exclude:
  //   - null / "unknown" grade_en (book mentions but doesn't grade)
  //   - citation-only grade_ar like «ذكره ابن حجر في الإصابة»
  //   - for Companions: jarh tiers (parser noise — Companions are عدول)
  const graded = grades.filter((g) => {
    if (!g.grade_en || g.grade_en === "unknown") return false;
    if (isMentionOnly(g.grade_ar)) return false;
    const isJarhTier =
      g.grade_en === "weak" ||
      g.grade_en === "abandoned" ||
      g.grade_en === "fabricator";
    if (isCompanion && isJarhTier) return false;
    return true;
  });

  if (graded.length === 0) {
    return { distinctGrades: 0, tierSpread: 0, highest: null, lowest: null };
  }
  const distinct = new Set(graded.map((g) => g.grade_en));
  let highest = graded[0];
  let lowest = graded[0];
  for (const g of graded) {
    if (gradeTier(g.grade_en) > gradeTier(highest.grade_en)) highest = g;
    if (gradeTier(g.grade_en) < gradeTier(lowest.grade_en)) lowest = g;
  }
  return {
    distinctGrades: distinct.size,
    tierSpread:
      gradeTier(highest.grade_en) - gradeTier(lowest.grade_en),
    highest,
    lowest,
  };
}

interface NarratorRow {
  id: number;
  full_name: string;
  kunya: string | null;
  laqab: string | null;
  nasab: string | null;
  grade_en: string | null;
  grade_ar: string | null;
  death: string | null;
  tabaqat: string | null;
  city: string | null;
  itqan_confidence: string | null;
}

/** Look up one narrator with its name variants, per-book grades, and links. */
export async function getNarrator(id: number): Promise<NarratorDetail | null> {
  // COALESCE the AR-Sanad death_overlay in when Itqan's `death` is null —
  // see migration 003 and scripts/import-arsanad-deaths.ts.
  const base = await query<NarratorRow>(
    `SELECT id, full_name, kunya, laqab, nasab, grade_en, grade_ar,
            COALESCE(NULLIF(death, '-'), death_overlay) AS death,
            tabaqat, city, itqan_confidence
     FROM narrator WHERE id = $1`,
    [id],
  );
  if (base.rows.length === 0) return null;

  const [variants, grades, teachers, students] = await Promise.all([
    query<{ variant: string }>(
      "SELECT variant FROM name_variant WHERE narrator_id = $1 ORDER BY variant",
      [id],
    ),
    query<SourceGrade>(
      `SELECT source_book, entry_id, grade_en, grade_ar
       FROM source_grade WHERE narrator_id = $1`,
      [id],
    ),
    query<{ teacher_id: number }>(
      "SELECT teacher_id FROM transmission WHERE student_id = $1",
      [id],
    ),
    query<{ student_id: number }>(
      "SELECT student_id FROM transmission WHERE teacher_id = $1",
      [id],
    ),
  ]);

  const sourceGrades = grades.rows;
  const sortedSourceGrades = [...sourceGrades].sort(
    (a, b) => gradeTier(b.grade_en) - gradeTier(a.grade_en),
  );
  const tabaqat = base.rows[0].tabaqat ?? "";
  const isCompanion = /صحاب|العشرة/.test(tabaqat);
  const disagreement = computeDisagreement(sourceGrades, { isCompanion });

  return {
    ...base.rows[0],
    nameVariants: variants.rows.map((r) => r.variant),
    sourceGrades,
    sortedSourceGrades,
    disagreement,
    teacherIds: teachers.rows.map((r) => r.teacher_id),
    studentIds: students.rows.map((r) => r.student_id),
  };
}
