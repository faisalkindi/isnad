// Rule-based hadith classifications computed from our DB.
// IMPORTANT: every rule applies ONLY to what's in our corpus (18 hadith books
// + 22 rijāl books). The UI must say «في كتبنا» — a hadith we label غريب
// might be مشهور or even متواتر in books we haven't imported.

import type {
  MatchedNarrator,
  ChainLink,
  ChainVerdict,
  HadithMatch,
} from "./matcher";

// ---------- (1) by number — متواتر / مشهور / عزيز / غريب ----------
//
// CLASSICAL METHODOLOGY (2026-05-25). Implements Ibn Ḥajar's rule end-to-end:
//
//   "أن يرويه عدد كثير عن مثلهم إلى منتهاه، وأن تستمر تلك الكثرة في كل
//    طبقات السند"  (Nuzhat al-Naẓar; al-Āmidī, al-Aḥkām 2/14; Ibn al-Ṣalāḥ;
//    al-Nawawī; al-Suyūṭī, all aligned)
//
// We compute multiplicity per طبقة, NOT per narrator. The pipeline is:
//   1. corpus-search finds every chain in our 18 books carrying this matn
//   2. each corpus chain is parsed into narrators (LLM segmenter, cached
//      per hadith id in `corpus_chain_cache`)
//   3. chains are aligned by the source end (Companion at level 0)
//   4. at each level, count DISTINCT narrators across all chains
//   5. the chain's class = the MINIMUM count across all levels — the
//      bottleneck that caps the matn's spread
//
// This catches the canonical counter-example correctly:
// إنما الأعمال بالنية — 200×+ chains AFTER Yaḥyā bn Saʿīd but only 1×
// before (single Companion عمر → Tabiʿī علقمة → … → Yaḥyā). min count = 1
// → غريب. Despite hundreds of compiler-level entries, classical truth wins.
//
// Edge cases:
//   - no corpus matches    → unknown (matn not in our corpus, can't measure)
//   - all parses failed    → unknown (LLM couldn't extract any chain)

import type { HadithMatch as _HadithMatch } from "./matcher";
import type { AlignedChains } from "./chain-align";
import { shortName } from "../names";

export type NumberClass =
  | "mutawatir"
  | "mashhur"
  | "aziz"
  | "gharib_mutlaq"
  | "gharib_nisbi"
  | "unknown";

export interface NumberClassification {
  type: NumberClass;
  label: string;
  reason: string;
  /** Distinct corpus hadith records carrying (a near-match of) this matn. */
  corpusOccurrences: number;
  /** Distinct authoritative books among those records. */
  distinctBooks: number;
}

const NUMBER_LABEL: Record<NumberClass, string> = {
  mutawatir: "متواتر",
  mashhur: "مشهور",
  aziz: "عزيز",
  gharib_mutlaq: "غريب مطلق",
  gharib_nisbi: "غريب نسبي",
  unknown: "غير محدَّد",
};

/** Per-level breakdown — kept in the public type for backwards-compat with
 *  callers/UI that may display the bottleneck. Now only populated minimally
 *  (single entry: the chain source). */
export interface LevelSpread {
  position: number;
  name: string;
  /** Always 0 under the new methodology — we no longer use per-narrator
   *  student counts for number classification. */
  studentsCount: number;
}

/** Ibn Ḥajar's preferred threshold for مُتواتر at each level. Other scholars
 *  proposed 4, 7, 12, 40, 70. We follow Ibn Ḥajar / al-Suyūṭī's 10 — but
 *  even at ≥10 chains we still don't auto-claim متواتر without per-level
 *  verification (see file header). */
const MASHHUR_MIN = 3;
const AZIZ_MIN = 2;
const MUTAWATIR_CANDIDATE_MIN = 10;

/** Classify by the classical Ibn Ḥajar rule applied per-طبقة. Takes the
 *  pre-computed chain alignment (parsed corpus chains, counted per level)
 *  and the user's matched chain narrators (for source-identity / غريب
 *  مطلق vs نسبي subtype). */
export function classifyByNumber(
  narrators: MatchedNarrator[],
  aligned: AlignedChains | null,
  corpusMatches: _HadithMatch[],
): NumberClassification & { spread: LevelSpread[] } {
  const chronological = [...narrators]
    .filter((n) => n.narrator && n.narrator.id > 0)
    .reverse();
  const sourceNarrator = chronological[0];
  // Detect Companion across three fields — the DB is inconsistent:
  //   • grade_en is often "mostly_reliable" for famous Companions like Umar
  //     (data import flattened them under generic reliability)
  //   • grade_ar sometimes carries "صحابي" / "له صحبة" / "أدرك النبي"
  //   • tabaqat is the most reliable signal: "صحابي", "أحد العشرة",
  //     "العشرة" mark Companions explicitly
  const COMPANION_RX = /صحاب|صحبة|له\s+صحبة|أدرك\s+النبي|العشرة/;
  const sourceIsCompanion =
    sourceNarrator?.narrator?.grade_en === "companion" ||
    COMPANION_RX.test(sourceNarrator?.narrator?.grade_ar ?? "") ||
    COMPANION_RX.test(sourceNarrator?.narrator?.tabaqat ?? "");
  const spread: LevelSpread[] = sourceNarrator
    ? [
        {
          position: sourceNarrator.position,
          name: sourceNarrator.narrator!.full_name.slice(0, 30),
          studentsCount: 0,
        },
      ]
    : [];

  // No alignment data means we found nothing in corpus (or all parses failed).
  if (!aligned || aligned.totalChains === 0) {
    return {
      type: "unknown",
      label: NUMBER_LABEL.unknown,
      reason:
        "لم نعثر على متن قريب من المتن المُستخرَج في كتبنا الـ19، فلا نستطيع عدّ الطرق. غير معروف العدد في كتبنا.",
      corpusOccurrences: 0,
      distinctBooks: 0,
      spread,
    };
  }

  const { minCount, narrowestLevel, totalChains, distinctBooks, levels } =
    aligned;
  const bottleneckNames = levels[narrowestLevel]?.names ?? [];
  const bottleneckExample =
    bottleneckNames.length > 0 ? bottleneckNames[0].slice(0, 35) : "—";

  // Build per-level breakdown summary for the reason text.
  const levelSummary = levels
    .map((l) => `ط${l.level + 1}:${l.count}`)
    .join("/");

  if (minCount >= MUTAWATIR_CANDIDATE_MIN) {
    return {
      type: "mutawatir",
      label: NUMBER_LABEL.mutawatir,
      reason:
        `تحقّقت كثرة الرواة في كل طبقة من السند (الحدّ الأدنى ${minCount} راوٍ في طبقة ${narrowestLevel + 1})، ` +
        `وذلك بناءً على ${totalChains} طريقًا للمتن في ${distinctBooks} كتب من كتبنا. ` +
        `توزيع الطبقات (من المصدر إلى المصنِّف): ${levelSummary}.`,
      corpusOccurrences: totalChains,
      distinctBooks,
      spread,
    };
  }
  if (minCount >= MASHHUR_MIN) {
    return {
      type: "mashhur",
      label: NUMBER_LABEL.mashhur,
      reason:
        `أضيق طبقة في السلسلة هي طبقة ${narrowestLevel + 1} (مثال: «${bottleneckExample}») بـ${minCount} رواة، ` +
        `وذلك بفحص ${totalChains} طريقًا في ${distinctBooks} كتب — يستوفي شرط المشهور دون التواتر. ` +
        `توزيع الطبقات: ${levelSummary}.`,
      corpusOccurrences: totalChains,
      distinctBooks,
      spread,
    };
  }
  if (minCount === AZIZ_MIN) {
    return {
      type: "aziz",
      label: NUMBER_LABEL.aziz,
      reason:
        `أضيق طبقة في السلسلة هي طبقة ${narrowestLevel + 1} (مثال: «${bottleneckExample}») بـراويَين اثنين، ` +
        `بفحص ${totalChains} طريقًا في ${distinctBooks} كتب — يستوفي شرط العزيز. ` +
        `توزيع الطبقات: ${levelSummary}.`,
      corpusOccurrences: totalChains,
      distinctBooks,
      spread,
    };
  }
  // minCount === 1: غريب. مطلق إن كان التفرُّد عند الصحابي (الأصل)، وإلا نسبي.
  const isAtSource = narrowestLevel === 0;
  const narrative = buildGharibNarrative(chronological, isAtSource && sourceIsCompanion);
  if (isAtSource && sourceIsCompanion) {
    return {
      type: "gharib_mutlaq",
      label: NUMBER_LABEL.gharib_mutlaq,
      reason: narrative
        ? `${narrative} — فهو فرد مطلق.`
        : `تفرَّد بروايته راوٍ واحد عند المصدر (الصحابي «${bottleneckExample}») — غرابة مطلقة.`,
      corpusOccurrences: totalChains,
      distinctBooks,
      spread,
    };
  }
  return {
    type: "gharib_nisbi",
    label: NUMBER_LABEL.gharib_nisbi,
    reason: narrative
      ? `${narrative} — فهو فرد نسبي (تَفرُّد عند طبقة ${narrowestLevel + 1}).`
      : `تفرَّد بروايته راوٍ واحد عند طبقة ${narrowestLevel + 1} (مثال: «${bottleneckExample}») — غرابة نسبية.`,
    corpusOccurrences: totalChains,
    distinctBooks,
    spread,
  };
}

/** Build the narrative «تفرّد به X عن Y، ثم تفرّد به A عن B …» by walking
 *  the chronological chain. When `isMarfu`, the first link is "عن النبي ﷺ"
 *  even though the Prophet isn't in `chronological` (he's id=-1, filtered).
 *  Returns null if the chain is too short to narrate. */
function buildGharibNarrative(
  chronological: MatchedNarrator[],
  startsAtCompanion: boolean,
): string | null {
  if (chronological.length < 2) return null;
  const links: string[] = [];
  for (let i = 0; i < chronological.length; i++) {
    const studentN = chronological[i].narrator;
    if (!studentN) continue;
    const student = shortName(studentN.full_name);
    let teacher: string;
    if (i === 0) {
      if (!startsAtCompanion) continue; // only narrate the X←Prophet leg when sahabi source
      teacher = "النبي ﷺ";
    } else {
      const teacherN = chronological[i - 1].narrator;
      if (!teacherN) continue;
      teacher = shortName(teacherN.full_name);
    }
    links.push(
      links.length === 0
        ? `تفرَّد به ${student} عن ${teacher}`
        : `ثم تفرَّد به ${student} عن ${teacher}`,
    );
  }
  if (links.length === 0) return null;
  return links.join("، ");
}

// ---------- (2) saqṭ type — type of break for a broken chain ----------

export type SaqtType =
  | "muallaq"
  | "mursal"
  | "munqati"
  | "mudal"
  | "none";

export interface SaqtClassification {
  type: SaqtType;
  label: string;
  reason: string;
}

const SAQT_LABEL: Record<SaqtType, string> = {
  muallaq: "معلَّق",
  mursal: "مرسل",
  munqati: "منقطع",
  mudal: "معضل",
  none: "—",
};

/** Detect the TYPE of saqṭ when the chain has gaps.
 *   - معلَّق  : gap at the START (compiler doesn't name his teacher)
 *   - مرسل   : a Tābiʿī ascribes directly to the Prophet without a Companion
 *   - منقطع  : a single narrator dropped in the middle
 *   - معضل   : two or more consecutive narrators dropped
 *   Returns "none" when the chain has no apparent gap. */
export function classifySaqt(
  narrators: MatchedNarrator[],
  links: ChainLink[],
): SaqtClassification {
  // If any link is `impossible`, there's an outright break.
  const impossibleLinks = links.filter((l) => l.status === "impossible");
  if (impossibleLinks.length === 0) {
    // Could still be مرسل if the last narrator is a Tābiʿī and the chain
    // ends marfūʿ — caller should verify against nisbah.
    const last = [...narrators].reverse().find((n) => n.narrator);
    const lastIsTabii =
      !!last?.narrator?.tabaqat && /تابع/.test(last.narrator.tabaqat);
    const lastIsCompanion =
      last?.narrator?.grade_en === "companion" ||
      /صحاب|صحبة/.test(last?.narrator?.grade_ar ?? "");
    if (lastIsTabii && !lastIsCompanion) {
      // We can't tell at this layer whether the matn was raised to the Prophet;
      // matcher will combine this with nisbah. Default: not مرسل unless caller
      // confirms marfūʿ ascription.
      return {
        type: "none",
        label: SAQT_LABEL.none,
        reason: "السلسلة متصلة ظاهرًا.",
      };
    }
    return { type: "none", label: SAQT_LABEL.none, reason: "السلسلة متصلة ظاهرًا." };
  }
  // Count consecutive impossible links.
  const positions = impossibleLinks.map((l) => l.from_position).sort((a, b) => a - b);
  const consecutive = positions.length > 1 &&
    positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (positions[0] === 0) {
    return {
      type: "muallaq",
      label: SAQT_LABEL.muallaq,
      reason: "السقط في أول السند (المُصنِّف لم يذكر شيخه).",
    };
  }
  if (consecutive) {
    return {
      type: "mudal",
      label: SAQT_LABEL.mudal,
      reason: `سقط راويان فأكثر متتابعَين في السند.`,
    };
  }
  return {
    type: "munqati",
    label: SAQT_LABEL.munqati,
    reason: "سقط راوٍ واحد في وسط السند.",
  };
}

/** Override for mursal: caller (matcher) calls this when nisbah is مرفوع
 *  but the last named narrator is a Tābiʿī, no Companion in between. */
export function isMursal(
  narrators: MatchedNarrator[],
  nisbahIsRaisedToProphet: boolean,
): boolean {
  if (!nisbahIsRaisedToProphet) return false;
  const last = [...narrators].reverse().find((n) => n.narrator);
  if (!last?.narrator) return false;
  const isCompanion =
    last.narrator.grade_en === "companion" ||
    /صحاب|صحبة|له\s+صحبة|أدرك\s+النبي/.test(last.narrator.grade_ar ?? "");
  const isTabii =
    !!last.narrator.tabaqat && /تابع/.test(last.narrator.tabaqat);
  return isTabii && !isCompanion;
}

// ---------- (3) ṣaḥīḥ vs ḥasan, li-dhātih vs li-ghayrih ----------

export type RankRefinement =
  | "sahih_li_dhatih"
  | "sahih_li_ghayrih"
  | "hasan_li_dhatih"
  | "hasan_li_ghayrih"
  | "daif"
  | "broken"
  | "needs_review";

export interface RankClassification {
  type: RankRefinement;
  label: string;
  reason: string;
}

const RANK_LABEL: Record<RankRefinement, string> = {
  sahih_li_dhatih: "صحيح لذاته",
  sahih_li_ghayrih: "صحيح لغيره",
  hasan_li_dhatih: "حسن لذاته",
  hasan_li_ghayrih: "حسن لغيره",
  daif: "ضعيف",
  broken: "منقطع",
  needs_review: "يحتاج إلى مراجعة",
};

/** Refine the base verdict using ACTUAL corroboration from chain alignment.
 *
 * IMPORTANT METHODOLOGY (verified Ibn al-Ṣalāḥ / Ibn Ḥajar 2026-05-25):
 *   The suffix «لغيره» (li-ghayrih) means the rank was elevated by
 *   INDEPENDENT corroborating chains (متابعات / شواهد). Counting raw
 *   corpus_matches is wrong because the same single chain appears
 *   across many books (e.g., إنما الأعمال has one chain Umar→…→Yaḥyā
 *   but appears in Bukhārī, Muslim, Abū Dāwūd, etc. — all the same chain).
 *
 *   The aligned per-طبقة analysis (chain-align.ts) tells us how many
 *   DISTINCT chains exist at the narrowest level. We only upgrade to
 *   *_li_ghayrih when minCount ≥ 2 (i.e., number class is ʿazīz or higher).
 *   When the chain is gharīb (mutlaq or nisbi) we leave the base verdict
 *   intact — classical scholars accept «صحيح غريب» as a valid combination
 *   but NOT «حسن لغيره غريب» (which would be self-contradictory).
 *
 * Rules:
 *   - ṣaḥīḥ candidate                            → ṣaḥīḥ li-dhātih (always)
 *   - ḥasan candidate + ≥2 distinct chains       → ṣaḥīḥ li-ghayrih
 *   - ḥasan candidate + 1 chain (gharīb)         → ḥasan li-dhātih
 *   - daif + ≥3 distinct chains                  → ḥasan li-ghayrih
 *   - daif + <3 distinct chains (incl. gharīb)   → daif
 *   - broken / needs_review                       → pass-through
 */
export function refineRank(
  verdict: ChainVerdict,
  matches: HadithMatch[],
  aligned: import("./chain-align").AlignedChains | null,
): RankClassification {
  // Use the aligned per-طبقة minimum (distinct chains at the narrowest
  // level) — that's the real number of independent routes. Fall back to
  // matches.length only when we have no alignment (e.g., the corpus chain
  // segmenter failed for every match). Always cap by raw count.
  const distinctChains = aligned ? aligned.minCount : matches.length;
  const corroboration = Math.min(distinctChains, matches.length);
  if (verdict === "sahih_candidate") {
    return {
      type: "sahih_li_dhatih",
      label: RANK_LABEL.sahih_li_dhatih,
      reason: "اتصل الإسناد بنقل العدل التامّ الضبط — صحيح بذاته دون حاجة إلى شواهد.",
    };
  }
  if (verdict === "hasan_candidate") {
    if (corroboration >= 2) {
      return {
        type: "sahih_li_ghayrih",
        label: RANK_LABEL.sahih_li_ghayrih,
        reason: `حسنٌ لذاته في الأصل، وارتقى إلى الصحة لورود المتن من ${corroboration} طرق مستقلّة عند أضيق طبقاته في كتبنا.`,
      };
    }
    return {
      type: "hasan_li_dhatih",
      label: RANK_LABEL.hasan_li_dhatih,
      reason:
        "اتصل الإسناد بنقل العدل الذي خفّ ضبطه — حسن بذاته. " +
        (matches.length >= 2
          ? `(وردت ${matches.length} نسخ للمتن في كتبنا لكنها كلها تمرّ بنفس السلسلة عند أضيق طبقاتها، فلم ترتقِ الرتبة بـ«لغيره».)`
          : ""),
    };
  }
  if (verdict === "daif") {
    if (corroboration >= 3) {
      return {
        type: "hasan_li_ghayrih",
        label: RANK_LABEL.hasan_li_ghayrih,
        reason: `ضعيفٌ بذاته لكن ارتقى إلى الحسن لورود المتن من ${corroboration} طرق مستقلّة عند أضيق طبقاته في كتبنا، يقوّي بعضها بعضًا.`,
      };
    }
    return {
      type: "daif",
      label: RANK_LABEL.daif,
      reason:
        "ضعيف الإسناد، ولم يجد ما يقوّيه من الشواهد. " +
        (matches.length >= 3
          ? `(وردت ${matches.length} نسخ للمتن في كتبنا لكنها كلها تمرّ بنفس السلسلة عند أضيق طبقاتها، فلم ترتقِ الرتبة بـ«لغيره».)`
          : ""),
    };
  }
  if (verdict === "broken") {
    return { type: "broken", label: RANK_LABEL.broken, reason: "إسناد منقطع." };
  }
  return {
    type: "needs_review",
    label: RANK_LABEL.needs_review,
    reason: "يحتاج إلى مراجعة بشريّة.",
  };
}

// ---------- (4) maqbūl / mardūd ----------

export type Acceptance = "maqbul" | "mardud" | "indeterminate";

export interface AcceptanceClassification {
  type: Acceptance;
  label: string;
  reason: string;
}

export function classifyAcceptance(rank: RankRefinement): AcceptanceClassification {
  if (
    rank === "sahih_li_dhatih" ||
    rank === "sahih_li_ghayrih" ||
    rank === "hasan_li_dhatih" ||
    rank === "hasan_li_ghayrih"
  ) {
    return {
      type: "maqbul",
      label: "مقبول",
      reason: "بَلَغ شروط القبول إمّا بذاته أو بانضمام طرق أخرى إليه.",
    };
  }
  if (rank === "daif" || rank === "broken") {
    return {
      type: "mardud",
      label: "مردود",
      reason: "لم يبلغ شروط القبول — ضعيف أو منقطع.",
    };
  }
  return {
    type: "indeterminate",
    label: "غير محدَّد",
    reason: "يحتاج إلى مراجعة قبل الحكم بالقبول أو الردّ.",
  };
}

// ---------- (5) asbāb al-ṭaʿn — the 10 classical causes of impugnment ----------

export type TanReason =
  // 5 in عدالة
  | "kidhb"
  | "tuhmat_kidhb"
  | "fisq"
  | "jahala"
  | "bidaa"
  // 5 in ضبط
  | "fahsh_ghalat"
  | "ghafla"
  | "ghalat"
  | "mukhalafa"
  | "fasad_hifz";

export const TAN_LABELS: Record<TanReason, { ar: string; cat: "adala" | "dabt" }> = {
  kidhb: { ar: "الكذب على رسول الله ﷺ", cat: "adala" },
  tuhmat_kidhb: { ar: "التُّهمة بالكذب", cat: "adala" },
  fisq: { ar: "الفِسق (مجاهرة بالمعصية)", cat: "adala" },
  jahala: { ar: "الجهالة بحاله", cat: "adala" },
  bidaa: { ar: "البدعة المُكفِّرة أو المُفسِّقة", cat: "adala" },
  fahsh_ghalat: { ar: "فُحش الغلط (كثرة الأخطاء)", cat: "dabt" },
  ghafla: { ar: "الغفلة عن الإتقان", cat: "dabt" },
  ghalat: { ar: "الغلط", cat: "dabt" },
  mukhalafa: { ar: "مخالفة الثقات", cat: "dabt" },
  fasad_hifz: { ar: "فساد الحفظ (الاختلاط)", cat: "dabt" },
};

// Pattern → reason mapping. Each pattern checked against grade_ar text;
// patterns ordered by specificity (most specific first).
const TAN_PATTERNS: Array<[RegExp, TanReason]> = [
  [/كذاب|كذّاب|دجال|وضّاع|يضع\s+الحديث|يضع|يكذب/u, "kidhb"],
  [/متهم\s+بالكذب|متّهم\s+بالكذب|اتهموه\s+بالكذب/u, "tuhmat_kidhb"],
  [/فاسق|مجاهر\s+بالفسق/u, "fisq"],
  [/مجهول|لا\s+يعرف|غير\s+معروف(\s+الحال)?/u, "jahala"],
  [/مبتدع|رافضي|خارجي|مرجئ|قدري\s+داعية/u, "bidaa"],
  [/فاحش\s+الغلط|كثير\s+الخطأ/u, "fahsh_ghalat"],
  [/مغفّل|الغفلة|كثير\s+الغفلة/u, "ghafla"],
  [/يخطئ|كثير\s+الغلط|سيء\s+الحفظ/u, "ghalat"],
  [/مخالف\s+للثقات|خالف\s+الثقات|منكر\s+الحديث/u, "mukhalafa"],
  [/مختلط|اختلط|تغيّر|فاسد\s+الحفظ/u, "fasad_hifz"],
];

/** Identify which of the 10 classical asbāb al-ṭaʿn a narrator's grade_ar
 *  text matches. Returns an empty array when nothing matches (e.g., narrator
 *  graded ثقة / صدوق). */
export function detectTanReasons(gradeAr: string | null | undefined): TanReason[] {
  if (!gradeAr) return [];
  const found = new Set<TanReason>();
  for (const [rx, reason] of TAN_PATTERNS) {
    if (rx.test(gradeAr)) found.add(reason);
  }
  return [...found];
}
