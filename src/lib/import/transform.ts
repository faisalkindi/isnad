// Maps an Itqan narrator profile (see src/test/fixtures/profile-320.json)
// into the row shapes used by our database schema.

export interface ItqanProfile {
  id: number;
  full_name: string;
  kunya?: string;
  laqab?: string;
  nasab?: string;
  grade_en?: string;
  grade_ar?: string;
  death?: string;
  tabaqat?: string;
  city?: string;
  confidence?: string;
  id_score?: number;
  grade_score?: number;
  namings?: string[];
  classical_sources?: Record<
    string,
    { entry_id?: number; grade_en?: string; grade_ar?: string }
  >;
  teachers?: number[];
  students?: number[];
}

export interface NarratorRow {
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
  id_score: number | null;
  grade_score: number | null;
}

export interface NameVariantRow {
  narrator_id: number;
  variant: string;
  normalized_variant: string;
}

export interface SourceGradeRow {
  narrator_id: number;
  source_book: string;
  entry_id: number | null;
  grade_en: string | null;
  grade_ar: string | null;
}

export interface TransmissionRow {
  student_id: number;
  teacher_id: number;
}

export interface TransformResult {
  narrator: NarratorRow;
  nameVariants: NameVariantRow[];
  sourceGrades: SourceGradeRow[];
  transmissions: TransmissionRow[];
}

function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * Transform one Itqan profile into database rows. Missing values (Itqan's "-")
 * are kept verbatim — the UI decides how to present "not recorded".
 * `normalized_variant` is left blank here; the name-index step fills it.
 */
export function transformProfile(p: ItqanProfile): TransformResult {
  const narrator: NarratorRow = {
    id: p.id,
    full_name: p.full_name,
    kunya: orNull(p.kunya),
    laqab: orNull(p.laqab),
    nasab: orNull(p.nasab),
    grade_en: orNull(p.grade_en),
    grade_ar: orNull(p.grade_ar),
    death: orNull(p.death),
    tabaqat: orNull(p.tabaqat),
    city: orNull(p.city),
    itqan_confidence: orNull(p.confidence),
    id_score: orNull(p.id_score),
    grade_score: orNull(p.grade_score),
  };

  const nameVariants: NameVariantRow[] = (p.namings ?? []).map((variant) => ({
    narrator_id: p.id,
    variant,
    normalized_variant: "",
  }));

  const sourceGrades: SourceGradeRow[] = Object.entries(
    p.classical_sources ?? {},
  ).map(([source_book, g]) => ({
    narrator_id: p.id,
    source_book,
    entry_id: orNull(g.entry_id),
    grade_en: orNull(g.grade_en),
    grade_ar: orNull(g.grade_ar),
  }));

  const transmissions: TransmissionRow[] = [
    ...(p.teachers ?? []).map((teacher_id) => ({
      student_id: p.id,
      teacher_id,
    })),
    ...(p.students ?? []).map((student_id) => ({
      student_id,
      teacher_id: p.id,
    })),
  ];

  return { narrator, nameVariants, sourceGrades, transmissions };
}
