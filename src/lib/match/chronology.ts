// Chronological possibility check for one teacher-student link, using only
// death years (Hijri). Birth years are not in Itqan, so we bound the unknowns
// with conservative max lifespan and minimum age of valid samāʿ.
//
// Parameters (see design doc §6):
//   max lifespan = 100 years
//   minimum hadith-hearing age = 7 years (tamyīz / discernment)
//
// Honest design: when even the most favorable assumption fails, we declare
// impossible. Otherwise we return "possible" — we do not produce a doubtful
// verdict from death-year data alone (per the domain review's HIGH-4 finding).

const MAX_LIFESPAN = 100;
const MIN_HEARING_AGE = 7;
// S could have been ≥7 only after S.death - (MAX_LIFESPAN - MIN_HEARING_AGE).
// If S.death - T.death > this number, S was too young when T died.
const STUDENT_AGE_THRESHOLD = MAX_LIFESPAN - MIN_HEARING_AGE; // 93

// `attested` is stronger than `possible`: it means an explicit teacher-student
// edge for this pair exists in Itqan's `transmission` table (extracted from the
// rijāl literature, e.g., Tahdhīb al-Kamāl). It is what classical scholars
// call "ثبوت اللقاء" — proven meeting, the Bukhārī standard for اتصال.
export type LinkStatus = "attested" | "possible" | "impossible" | "unknown";

export interface ChronologyInput {
  death: string | null;
}

export interface LinkCheck {
  status: LinkStatus;
  reason: string;
}

/** Pull every Hijri-year integer out of an Itqan death string. */
export function parseDeathYears(death: string | null): number[] {
  if (!death || death === "-") return [];
  const matches = death.match(/\d+/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => n > 0 && n < 2000);
}

/**
 * Check whether student S could have heard from teacher T, given only death
 * years. Uses the most favorable interpretation of any date alternatives.
 */
export function checkLink(
  student: ChronologyInput,
  teacher: ChronologyInput,
): LinkCheck {
  const sYears = parseDeathYears(student.death);
  const tYears = parseDeathYears(teacher.death);

  if (sYears.length === 0 || tYears.length === 0) {
    return { status: "unknown", reason: "إحدى الوفاتين غير مذكورة" };
  }

  const sMin = Math.min(...sYears);
  const sMax = Math.max(...sYears);
  const tMin = Math.min(...tYears);
  const tMax = Math.max(...tYears);

  // Case 1: student too young when teacher died.
  // Most favorable: smallest sMin, largest tMax. If even then the gap > 93, impossible.
  if (sMin - tMax > STUDENT_AGE_THRESHOLD) {
    return {
      status: "impossible",
      reason: `الطالب توفي ${sMin}هـ والشيخ توفي ${tMax}هـ، والفجوة بين الوفاتين أكثر من ${STUDENT_AGE_THRESHOLD} سنة.`,
    };
  }

  // Case 2: teacher born after student died.
  // Most favorable: smallest tMin, largest sMax. If even then tMin - sMax > 100, impossible.
  if (tMin - sMax > MAX_LIFESPAN) {
    return {
      status: "impossible",
      reason: `الشيخ توفي ${tMin}هـ بعد وفاة الطالب ${sMax}هـ بأكثر من عمر الإنسان.`,
    };
  }

  return { status: "possible", reason: "الفجوة بين الوفاتين محتملة." };
}
