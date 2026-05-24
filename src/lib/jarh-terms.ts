// Verified jarh wa taʿdīl terminology glossary. Client-safe (pure data).
//
// Sources cross-checked:
//   - Marātib al-Jarḥ wa al-Taʿdīl (university course material, Univ. Emir
//     Abdelkader, Constantine — verified Q1 2026)
//   - Hadithnotes.org "The Science of al-Jarh wa al-Tadīl" by Muntasir Zaman
//   - Mufti Wilayah Persekutuan "Levels of al-Jarh wa al-Taʿdīl" (Series 347)
//   - Al-Andalus Libya Univ. study on Abū Aḥmad al-Ḥākim's usage
//
// Tier scale (separate for jarḥ and taʿdīl):
//   TAʿDĪL: 1 = strongest praise (ثقة ثبت), 4 = weak acceptance (مقبول)
//   JARḤ:   1 = mildest criticism (فيه ضعف), 5 = harshest (كذاب/وضاع)
//
// The optional `caveat` records scholar-specific usage that changes the meaning
// (e.g., Ibn Maʿīn used «ليس بشيء» to mean "few hadiths" not "worthless").

import { normalizeArabic } from "./normalize";

export interface JarhTerm {
  type: "tadil" | "jarh";
  tier: number;
  /** Plain-Arabic explanation suitable for non-specialists. */
  explanation: string;
  /** Optional scholar-specific nuance (e.g., Ibn Maʿīn). */
  caveat?: string;
}

// Source phrases. Normalization is applied when comparing, so we can list the
// most common spellings here.
const RAW_TERMS: Array<[string[], JarhTerm]> = [
  // === TAʿDĪL — tier 1 (strongest praise) ===
  [
    ["ثقة ثبت", "ثبت ثقة", "ثبت حافظ", "ثقة حجة", "ثقة حافظ", "ثقة متقن", "ثقة مأمون"],
    {
      type: "tadil",
      tier: 1,
      explanation:
        "أعلى مراتب التعديل — ضابطٌ تامّ، حافظٌ ثَبت. تُقبَل روايته بمفرده.",
    },
  ],
  [["ثقة", "ثقه", "نقة", "ثقة ثقة"], {
    type: "tadil",
    tier: 1,
    explanation: "عدلٌ ضابط، تُقبَل روايته بمفرده دون متابعة.",
  }],
  [
    ["أوثق الناس", "أثبت الناس", "إمام", "حجة", "أجمعوا على ثقته"],
    {
      type: "tadil",
      tier: 1,
      explanation: "أعلى توثيقٍ ممكن — حافظٌ مشهور لا يُختلف فيه.",
    },
  ],

  // === TAʿDĪL — tier 2 ===
  [["صدوق", "صدوق إن شاء الله"], {
    type: "tadil",
    tier: 2,
    explanation:
      "أهلٌ للصدق وأقلّ ضبطاً من الثقة. حديثه يُعَدّ من قبيل الحسن لذاته إن لم يُخالَف.",
  }],
  [["لا بأس به", "ليس به بأس", "صدوق لا بأس به"], {
    type: "tadil",
    tier: 2,
    explanation: "عدلٌ مقبول الحديث، قريب من رتبة الصدوق.",
  }],
  [["جيد الحديث", "حسن الحديث", "ثقة عدل", "ثقة صالح"], {
    type: "tadil",
    tier: 2,
    explanation: "ضبطه قويّ، يُحتجّ بحديثه في الجملة.",
  }],

  // === TAʿDĪL — tier 3 ===
  [["شيخ", "شيخ وسط"], {
    type: "tadil",
    tier: 3,
    explanation:
      "وُصِف بالشيخوخة في العلم — يُكتب حديثه للاعتبار، ولكن دون رتبة الصدوق.",
  }],
  [["محله الصدق"], {
    type: "tadil",
    tier: 3,
    explanation: "صدوقٌ في المنزلة، يُعتبَر بحديثه للمتابعات.",
  }],

  // === TAʿDĪL — tier 4 (weak acceptance) ===
  [["صالح الحديث", "صالح", "صويلح"], {
    type: "tadil",
    tier: 4,
    explanation:
      "يُكتب حديثه لينظَر فيه ويُقَوَّى بالشواهد — لا يُحتجّ به مستقلاً.",
  }],
  [["مقبول"], {
    type: "tadil",
    tier: 4,
    explanation:
      "اصطلاح ابن حجر في التقريب: يُقبَل حديثه عند المتابعة، وإلاّ فلَيِّن الحديث.",
  }],

  // === COMPANION / CITATION (not really a grade) ===
  [["صحابي", "صحبه", "له صحبة", "أدرك النبي"], {
    type: "tadil",
    tier: 1,
    explanation:
      "صَحابي — والصحابة كلّهم عدول بإجماع أهل السنة، فلا يُسأل عن عدالتهم.",
  }],

  // === JARḤ — tier 1 (mildest) ===
  [["فيه ضعف", "فيه شيء", "فيه مقال", "ليس بذاك", "ليس بذاك القوي"], {
    type: "jarh",
    tier: 1,
    explanation:
      "تليينٌ مخفّف — في حفظه شيء، يُكتب حديثه للاعتبار والتقوية.",
  }],
  [["ليس بالقوي", "ليس بقوي"], {
    type: "jarh",
    tier: 1,
    explanation:
      "حفظه ليس بقويّ — يُكتب حديثه ولكن يُتثَبَّت فيه بالمتابعات.",
  }],
  [["لين الحديث", "فيه لين", "ليّن", "لين"], {
    type: "jarh",
    tier: 1,
    explanation: "في ضبطه ليونة، يُكتب حديثه للاعتبار.",
  }],
  [["سيء الحفظ", "تكلموا فيه", "تكلم فيه", "غيره أوثق منه"], {
    type: "jarh",
    tier: 1,
    explanation: "في حفظه ضعف، لكنه لم يُجرَح جرحاً شديداً.",
  }],

  // === JARḤ — tier 2 ===
  [["ضعيف", "ضعيف الحديث", "ضعفه", "ضعفوه"], {
    type: "jarh",
    tier: 2,
    explanation:
      "حديثه ضعيف، لا يُحتجّ به مستقلاً، ويُكتب للاعتبار والشواهد.",
  }],
  [["منكر الحديث"], {
    type: "jarh",
    tier: 2,
    explanation:
      "يأتي بمناكير — حديثه مرفوض إلاّ ما وافق فيه الثقات.",
    caveat:
      "إذا أطلقها البخاري فهي عنده شديدة جداً («لا تحلّ الرواية عنه»).",
  }],

  // === JARḤ — tier 3 (severe weakness) ===
  [["ضعيف جداً", "ضعيف جدا", "واه", "واهٍ", "واه بمرة"], {
    type: "jarh",
    tier: 3,
    explanation:
      "ضعيف ضعفاً شديداً — لا يُقَوَّى بالمتابعات لشدّة ضعفه.",
  }],
  [
    [
      "ليس بشيء",
      "لا شيء",
      "لا يساوي شيئا",
      "لا يساوي شيئاً",
      "مطروح الحديث",
      "مردود الحديث",
      "طرحوه",
      "لا يكتب حديثه",
    ],
    {
      type: "jarh",
      tier: 3,
      explanation:
        "جرحٌ شديد — حديثه مطروحٌ مردود، لا يُكتب حتى للاعتبار.",
      caveat:
        "استعمل يحيى بن مَعين «ليس بشيء» أحياناً بمعنى «أحاديثه قليلة» — لا بمعنى الجرح الشديد. تَنبَّه إذا كان القائل ابن معين.",
    },
  ],

  // === JARḤ — tier 4 (abandoned) ===
  [
    [
      "متروك",
      "متروك الحديث",
      "تركه الناس",
      "تركوه",
      "ساقط",
      "هالك",
      "ذاهب الحديث",
      "تالف",
      "ليس بثقة",
      "ليس بمأمون",
      "يسرق الحديث",
    ],
    {
      type: "jarh",
      tier: 4,
      explanation:
        "متروك الحديث — أجمع الأئمّة على ترك حديثه، فلا يُكتَب ولا يُعتَبَر به.",
    },
  ],

  // === JARḤ — tier 5 (fabricator / liar) ===
  [
    [
      "كذاب",
      "كذّاب",
      "وضّاع",
      "يضع الحديث",
      "يضع",
      "متهم بالكذب",
      "متّهم بالكذب",
      "دجال",
      "اتهموه بالكذب",
    ],
    {
      type: "jarh",
      tier: 5,
      explanation:
        "أشدّ مراتب الجرح — مُتَّهَمٌ بالوضع والكذب، فحديثه مرفوضٌ مطلقاً.",
    },
  ],
];

// Build lookup map with normalized keys.
const LOOKUP = new Map<string, JarhTerm>();
for (const [variants, term] of RAW_TERMS) {
  for (const v of variants) LOOKUP.set(normalizeArabic(v), term);
}

/** Look up a grade_ar string in the glossary. Tries the whole string first,
 *  then strips common prefixes like «قال X:» or «وثّقه» to find a known phrase. */
export function lookupJarhTerm(gradeAr: string | null | undefined): JarhTerm | null {
  if (!gradeAr) return null;
  const norm = normalizeArabic(gradeAr.trim());
  if (LOOKUP.has(norm)) return LOOKUP.get(norm)!;
  // Try stripping common preambles.
  const stripped = norm
    .replace(/^(قال|روى|ذكره|ذكر|وثقه|ضعفه|قال فيه)\s+\S+\s*:?\s*/u, "")
    .trim();
  if (stripped !== norm && LOOKUP.has(stripped)) return LOOKUP.get(stripped)!;
  // Look for any known phrase as a substring (e.g., "ضعيف، روى عن ...").
  for (const [key, term] of LOOKUP) {
    if (norm.includes(key)) return term;
  }
  return null;
}

const TIER_LABEL: Record<string, string> = {
  "tadil:1": "تعديل قوي (المرتبة الأولى)",
  "tadil:2": "تعديل متوسط (المرتبة الثانية)",
  "tadil:3": "تعديل ضعيف (المرتبة الثالثة)",
  "tadil:4": "قبولٌ ضعيف (المرتبة الرابعة)",
  "jarh:1": "جرح مخفّف (المرتبة الأولى)",
  "jarh:2": "جرح متوسط (المرتبة الثانية)",
  "jarh:3": "جرح شديد (المرتبة الثالثة)",
  "jarh:4": "متروك (المرتبة الرابعة)",
  "jarh:5": "كذب/وضع (المرتبة الخامسة)",
};

export function tierLabel(term: JarhTerm): string {
  return TIER_LABEL[`${term.type}:${term.tier}`] ?? "";
}
