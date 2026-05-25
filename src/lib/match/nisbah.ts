// Classify a hadith by «نسبته إلى قائله» — to whom the statement is
// ultimately attributed. This is the classical division of khabar by ascription:
//
//   مرفوع صريح    The Prophet ﷺ explicitly (his statement, action, approval,
//                  description, or attribute).
//   مرفوع حكماً   A Companion's statement that classical scholars treat as
//                  raised to the Prophet by ruling — e.g., «أُمِرنا / نُهينا»
//                  (passive voice, no commander named) or «يبلغ به النبي» /
//                  «يرفعه» / «رواية».
//   قدسي          A subtype of marfūʿ where the Prophet attributes the saying
//                  to Allah (not the Qurʾān).
//   موقوف         Statement / action of a Companion (when not raised to the
//                  Prophet by ruling).
//   مقطوع         Statement / action of a Tābiʿī or later.
//   unknown       Insufficient signal (e.g., chain too short or all unmatched).
//
// Verified categories from Ibn al-Ṣalāḥ's Muqaddima, al-Nawawi's Taqrib, and
// Ibn Hajar's Nukhbat al-Fikr.

import { normalizeArabic } from "../normalize";

export type NisbahType =
  | "marfu_sarih"
  | "marfu_hukman"
  | "qudsi"
  | "mawquf"
  | "maqtu"
  | "unknown";

export interface NisbahResult {
  type: NisbahType;
  /** Plain-Arabic label suitable for a badge. */
  label: string;
  /** Plain-Arabic explanation showing what triggered the classification. */
  reason: string;
}

const LABEL: Record<NisbahType, string> = {
  marfu_sarih: "مرفوع صريح",
  marfu_hukman: "مرفوع حكماً",
  qudsi: "حديث قدسي",
  mawquf: "موقوف",
  maqtu: "مقطوع",
  unknown: "غير محدَّد",
};

// All marker regexes match against normalizeArabic(text), so they DO NOT need
// to account for tashkīl (kasrah, fatha, etc.) or alif/yā/tā-marbūṭa variants.

// QUDSI markers: matn explicitly quotes Allah via the Prophet.
const QUDSI_MARKERS =
  /(قال\s+الله(\s+تعالي|\s+عز\s+و?جل|\s+تبارك\s+و?تعالي)?|يقول\s+الله(\s+تعالي|\s+عز\s+و?جل)?|فيما\s+يرويه?\s+عن\s+رب|عن\s+رب[هك]|يقول\s+ربكم)/u;

// MARFŪʿ ṢARĪḤ markers: explicit ascription to the Prophet ﷺ.
const MARFU_SARIH_MARKERS =
  /(رسول\s+الله(\s+صلي\s+الله\s+عليه\s+و?سلم)?|النبي(\s+صلي\s+الله\s+عليه\s+و?سلم)?|محمد(ا)?\s+(صلي|رسول)|ﷺ|صلي\s+الله\s+عليه\s+و?سلم)/u;

// MARFŪʿ ḤUKMAN markers: phrases scholars treat as implicit ascription.
//   - أمرنا / نهينا (passive without naming the commander)
//   - يبلغ به النبي / يرفعه / رواية
//   - من السنة (in Companion's speech)
const MARFU_HUKMAN_MARKERS =
  /(امرنا(\s+ب|\s+ان)|نهينا(\s+عن|\s+ان)|يبلغ\s+به(\s+النبي|\s+رسول)?|يرفعه|رواية|من\s+السنه)/u;

/** Lightweight test: is the narrator a Companion based on his stored data?
 *  Mirrors the heuristic already used in `effectiveGrade()` / `effectiveGradeEn()`. */
function isCompanion(
  tabaqat: string | null | undefined,
  gradeAr: string | null | undefined,
  gradeEn: string | null | undefined,
): boolean {
  if (gradeEn === "companion") return true;
  const t = tabaqat ?? "";
  const g = gradeAr ?? "";
  return /صحاب|صحبة|له\s+رؤية/.test(t) || /صحاب|صحبة|له\s+صحبة|أدرك\s+النبي/.test(g);
}

/** A Tābiʿī's tabaqat usually contains «تابعي» or numeric generation 2-4. */
function isTabii(
  tabaqat: string | null | undefined,
): boolean {
  const t = tabaqat ?? "";
  if (/تابع/.test(t)) return true;
  // Ibn Hajar's 12 tabaqāt: 2-4 are roughly Tāʾbiʿīn levels
  if (/الثانية|الثالثة|الرابعة/.test(t) && !/الصحاب|الأولى/.test(t)) return true;
  return false;
}

export interface NisbahInput {
  /** The full text the user pasted (matn + isnād). Used to detect Prophet
   *  attribution markers that may have been stripped from the segmented matn. */
  rawText: string;
  /** The extracted matn (the actual quoted speech). */
  matn: string;
  /** The last matched narrator in the chain (the chain's terminal source). */
  lastNarrator: {
    tabaqat: string | null;
    grade_ar: string | null;
    grade_en: string | null;
  } | null;
}

/** Classify a hadith by ascription. */
export function detectNisbah(input: NisbahInput): NisbahResult {
  // Normalize once: strip tashkīl, unify alif/yā/tā-marbūṭa so the regexes
  // can be diacritic-blind.
  const text = normalizeArabic(`${input.rawText} ${input.matn}`);

  // QUDSI: marfūʿ + explicit divine speech via the Prophet.
  if (QUDSI_MARKERS.test(text) && MARFU_SARIH_MARKERS.test(text)) {
    return {
      type: "qudsi",
      label: LABEL.qudsi,
      reason:
        "اشتمل الحديث على لفظٍ يُسنده النبي ﷺ إلى الله تعالى (قال الله / يقول الله / فيما يرويه عن ربه).",
    };
  }

  // MARFŪʿ ṢARĪḤ: explicit Prophet ascription.
  if (MARFU_SARIH_MARKERS.test(text)) {
    return {
      type: "marfu_sarih",
      label: LABEL.marfu_sarih,
      reason: "نُسب القول/الفعل إلى النبي ﷺ صراحةً في النص.",
    };
  }

  // MARFŪʿ ḤUKMAN: implicit-by-ruling markers in a Companion's speech.
  if (MARFU_HUKMAN_MARKERS.test(text) && input.lastNarrator &&
      isCompanion(input.lastNarrator.tabaqat, input.lastNarrator.grade_ar, input.lastNarrator.grade_en)) {
    return {
      type: "marfu_hukman",
      label: LABEL.marfu_hukman,
      reason:
        "قال صحابيٌّ ما له حكم الرفع (كـ«أُمرنا» / «نُهينا» / «يبلغ به النبي» / «يرفعه»).",
    };
  }

  // Otherwise classify by the chain's terminal narrator.
  if (!input.lastNarrator) {
    return {
      type: "unknown",
      label: LABEL.unknown,
      reason: "لم يُتعرَّف على آخر راوٍ في السلسلة، فيتعذَّر تحديد النسبة.",
    };
  }
  if (isCompanion(input.lastNarrator.tabaqat, input.lastNarrator.grade_ar, input.lastNarrator.grade_en)) {
    return {
      type: "mawquf",
      label: LABEL.mawquf,
      reason: "السلسلة منتهية عند صحابي، دون نسبة القول إلى النبي ﷺ.",
    };
  }
  if (isTabii(input.lastNarrator.tabaqat)) {
    return {
      type: "maqtu",
      label: LABEL.maqtu,
      reason: "السلسلة منتهية عند تابعي، فالقول من قوله لا من قول النبي ﷺ.",
    };
  }
  return {
    type: "unknown",
    label: LABEL.unknown,
    reason:
      "السلسلة لا تنتهي عند النبي ولا عند صحابي معروف ولا عند تابعي بيِّن — يحتاج إلى تحقُّق.",
  };
}
