import { query } from "./db";

export interface SourceGrade {
  source_book: string;
  entry_id: number | null;
  grade_en: string | null;
  grade_ar: string | null;
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
  teacherIds: number[];
  studentIds: number[];
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
  const base = await query<NarratorRow>(
    `SELECT id, full_name, kunya, laqab, nasab, grade_en, grade_ar,
            death, tabaqat, city, itqan_confidence
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

  return {
    ...base.rows[0],
    nameVariants: variants.rows.map((r) => r.variant),
    sourceGrades: grades.rows,
    teacherIds: teachers.rows.map((r) => r.teacher_id),
    studentIds: students.rows.map((r) => r.student_id),
  };
}
