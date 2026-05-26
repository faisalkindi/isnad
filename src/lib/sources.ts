// Metadata for the 22 classical source-book keys Itqan uses.
//
// Each book has a methodological orientation that affects how you should read
// its grading of a narrator:
//   - jarh_leaning   = focuses on weak narrators; a "reliable" grade here is
//                      strong taʿdīl evidence; absence may not be jarḥ.
//   - tadil_leaning  = focuses on the trustworthy (e.g., Ibn Ḥibbān's Thiqāt,
//                      famously lenient — inclusion alone proves little).
//   - comprehensive  = aims for full coverage of a domain.
//   - companions     = restricted to the Ṣaḥāba.
//   - huffaz         = restricted to ḥadīth memorizers.
//   - qurra          = restricted to Qurʾān reciters.
//   - century        = restricted to one Hijrī century.

export type BookOrientation =
  | "jarh_leaning"
  | "tadil_leaning"
  | "comprehensive"
  | "companions"
  | "huffaz"
  | "qurra"
  | "century";

export interface SourceBookMeta {
  /** Itqan key (the source_book column value). */
  key: string;
  /** Arabic full title. */
  titleAr: string;
  /** Author (Arabic; "—" if uncertain). */
  authorAr: string;
  /** Author's death year (Hijrī, "—" if uncertain). */
  authorDeath: string;
  /** Methodological orientation — drives how to read inclusion. */
  orientation: BookOrientation;
  /** One-line Arabic description used as the tooltip / book caption. */
  noteAr: string;
}

const META: Record<string, SourceBookMeta> = {
  taqrib: {
    key: "taqrib",
    titleAr: "تقريب التهذيب",
    authorAr: "ابن حجر العسقلاني",
    authorDeath: "852 هـ",
    orientation: "comprehensive",
    noteAr: "خلاصة سطرٍ واحد لكل راوٍ من تهذيب التهذيب — أوسع مرجع للحكم المختصر.",
  },
  tahdhib_kamal: {
    key: "tahdhib_kamal",
    titleAr: "تهذيب الكمال",
    authorAr: "المزّي",
    authorDeath: "742 هـ",
    orientation: "comprehensive",
    noteAr: "ترجمة موسَّعة لكل رواة الكتب الستة، يشمل شيوخهم وتلاميذهم.",
  },
  tahdhib_tahdhib: {
    key: "tahdhib_tahdhib",
    titleAr: "تهذيب التهذيب",
    authorAr: "ابن حجر العسقلاني",
    authorDeath: "852 هـ",
    orientation: "comprehensive",
    noteAr: "تهذيب وتلخيص لتهذيب الكمال مع زيادات وتعقّبات.",
  },
  mizan: {
    key: "mizan",
    titleAr: "ميزان الاعتدال",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "jarh_leaning",
    noteAr: "مرجع جرحٍ موسَّع — يحوي كل من تُكلِّم فيه؛ وجود الراوي فيه قرينة جرح.",
  },
  lisan_mizan: {
    key: "lisan_mizan",
    titleAr: "لسان الميزان",
    authorAr: "ابن حجر العسقلاني",
    authorDeath: "852 هـ",
    orientation: "jarh_leaning",
    noteAr: "ذيل على الميزان يضمّ من ليس في تهذيب الكمال — جرحي الطابع.",
  },
  jarh: {
    key: "jarh",
    titleAr: "الجرح والتعديل",
    authorAr: "ابن أبي حاتم الرازي",
    authorDeath: "327 هـ",
    orientation: "comprehensive",
    noteAr: "أصل من أصول الجرح والتعديل، ينقل عن متقدّمي النقّاد.",
  },
  thiqat: {
    key: "thiqat",
    titleAr: "الثقات",
    authorAr: "ابن حبّان",
    authorDeath: "354 هـ",
    orientation: "tadil_leaning",
    noteAr: "كتاب توثيق — لكنّه واسع التساهل؛ ذكر الراوي فيه ليس وحده تعديلاً قاطعاً.",
  },
  kamil: {
    key: "kamil",
    titleAr: "الكامل في ضعفاء الرجال",
    authorAr: "ابن عدي الجرجاني",
    authorDeath: "365 هـ",
    orientation: "jarh_leaning",
    noteAr: "مرجع جرحٍ مهم في الضعفاء، يسوق أحاديث المُتَكَلَّم فيهم.",
  },
  mughni_ducafa: {
    key: "mughni_ducafa",
    titleAr: "المغني في الضعفاء",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "jarh_leaning",
    noteAr: "ملخَّص للضعفاء فحسب — ذكر الراوي فيه قرينة قويّة على الجرح.",
  },
  diwan_ducafa: {
    key: "diwan_ducafa",
    titleAr: "ديوان الضعفاء",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "jarh_leaning",
    noteAr: "ديوان مختصر للمتكلَّم فيهم — جرحي.",
  },
  dhayl_diwan: {
    key: "dhayl_diwan",
    titleAr: "ذيل ديوان الضعفاء",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "jarh_leaning",
    noteAr: "تكملةٌ على ديوان الضعفاء.",
  },
  kashif: {
    key: "kashif",
    titleAr: "الكاشف",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "comprehensive",
    noteAr: "مختصر لرواة الكتب الستة مع حكم الذهبي.",
  },
  isaba: {
    key: "isaba",
    titleAr: "الإصابة في تمييز الصحابة",
    authorAr: "ابن حجر العسقلاني",
    authorDeath: "852 هـ",
    orientation: "companions",
    noteAr: "موسوعة الصحابة — ذكر الراوي فيه إثبات صحبة لا حكم على ضبط أو عدالة.",
  },
  durar_kamina: {
    key: "durar_kamina",
    titleAr: "الدرر الكامنة",
    authorAr: "ابن حجر العسقلاني",
    authorDeath: "852 هـ",
    orientation: "century",
    noteAr: "تراجم أعيان القرن الثامن الهجري.",
  },
  tarikh_islam: {
    key: "tarikh_islam",
    titleAr: "تاريخ الإسلام",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "comprehensive",
    noteAr: "تاريخ عام مع تراجم — أوسع تاريخ رجاليّ للذهبي.",
  },
  tarikh: {
    key: "tarikh",
    titleAr: "التاريخ الكبير",
    authorAr: "البخاري",
    authorDeath: "256 هـ",
    orientation: "comprehensive",
    noteAr: "أصل قديم للرواة، إذ كان البخاري إماماً في العلل والرجال.",
  },
  siyar: {
    key: "siyar",
    titleAr: "سير أعلام النبلاء",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "comprehensive",
    noteAr: "سير أعلام الأمة — ميزانٌ مهم لأحكام الذهبي.",
  },
  tadhkirat_huffaz: {
    key: "tadhkirat_huffaz",
    titleAr: "تذكرة الحفّاظ",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "huffaz",
    noteAr: "تذكرة بأهل الحفظ من المحدّثين — ذكر الراوي فيه قرينة قوّة وضبط.",
  },
  tabaqat: {
    key: "tabaqat",
    titleAr: "الطبقات الكبرى",
    authorAr: "ابن سعد",
    authorDeath: "230 هـ",
    orientation: "comprehensive",
    noteAr: "طبقات الرواة على عصرهم — أوّل من رتّب على هذا النحو.",
  },
  mucin_tabaqat: {
    key: "mucin_tabaqat",
    titleAr: "المعين في طبقات المحدّثين",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "comprehensive",
    noteAr: "تصنيف الرواة في طبقات لمعرفة المعاصرة وإمكان اللقاء.",
  },
  mucjam_shuyukh: {
    key: "mucjam_shuyukh",
    titleAr: "معجم الشيوخ",
    authorAr: "—",
    authorDeath: "—",
    orientation: "comprehensive",
    noteAr: "معجمٌ يجمع شيوخ المؤلِّف — وثيقة للقاء المعاصرة.",
  },
  macrifa_qurra: {
    key: "macrifa_qurra",
    titleAr: "معرفة القرّاء الكبار",
    authorAr: "الذهبي",
    authorDeath: "748 هـ",
    orientation: "qurra",
    noteAr: "تراجم القرّاء — ذكر الراوي فيه يفيد إمامته في القراءات لا في الحديث بالضرورة.",
  },
  // Books imported as explicit-quote verdicts into narrator_grade_source
  daraqutni_mawsuah: {
    key: "daraqutni_mawsuah",
    titleAr: "موسوعة أقوال الدارقطني في رجال الحديث وعلله",
    authorAr: "الدارقطني (جمع: محمد مهدي المسلمي وآخرون)",
    authorDeath: "385 هـ",
    orientation: "jarh_leaning",
    noteAr: "موسوعة جامعة لأقوال الإمام الدارقطني في الرجال والعلل من 11 مصدرًا.",
  },
  ibn_hibban_majruhin: {
    key: "ibn_hibban_majruhin",
    titleAr: "المجروحين من المحدّثين",
    authorAr: "ابن حبّان البستي",
    authorDeath: "354 هـ",
    orientation: "jarh_leaning",
    noteAr: "خاصّ بالضعفاء والمجروحين؛ ذكر الراوي فيه قرينة جرحٍ غالبًا.",
  },
  ijli_thiqat: {
    key: "ijli_thiqat",
    titleAr: "معرفة الثقات",
    authorAr: "العجلي",
    authorDeath: "261 هـ",
    orientation: "tadil_leaning",
    noteAr: "كتاب تعديل قديم؛ يُعدّ من الأئمة المتشددين نسبيًّا، فإدراج الراوي فيه قرينة توثيق.",
  },
  // Phase 3 attestation source: verb-level proofs of سماع/لقاء etc.
  tarikh_kabir: {
    key: "tarikh_kabir",
    titleAr: "التاريخ الكبير",
    authorAr: "الإمام البخاري",
    authorDeath: "256 هـ",
    orientation: "comprehensive",
    noteAr: "كتاب البخاري في تراجم الرواة، يُسجّل صراحةً سماع الراوي ولقاءه وما رواه — أعلى درجات إثبات الاتصال.",
  },
  // Phase 2 source: documented non-meetings (overrides chronology).
  marasil_ibn_abi_hatim: {
    key: "marasil_ibn_abi_hatim",
    titleAr: "المراسيل",
    authorAr: "ابن أبي حاتم الرازي",
    authorDeath: "327 هـ",
    orientation: "jarh_leaning",
    noteAr: "كتابٌ مخصَّصٌ لجمع المراسيل وما لم يَسمَع فيه الراوي من شيخه؛ إثباتُ عدم اللقاء.",
  },
};

const ORIENTATION_LABEL_AR: Record<BookOrientation, string> = {
  jarh_leaning: "كتاب جرح",
  tadil_leaning: "كتاب تعديل (متساهل)",
  comprehensive: "شامل",
  companions: "خاصّ بالصحابة",
  huffaz: "خاصّ بالحفّاظ",
  qurra: "خاصّ بالقرّاء",
  century: "خاصّ بقرن معيَّن",
};

export function sourceBookAr(key: string): string {
  return META[key]?.titleAr ?? key;
}

export function sourceBookMeta(key: string): SourceBookMeta | null {
  return META[key] ?? null;
}

export function orientationLabel(o: BookOrientation): string {
  return ORIENTATION_LABEL_AR[o];
}

/** The canonical ordered list of rijāl source-book keys for which we expose
 *  a verdict slot in the narrator card. Order is: explicit-quote works
 *  (Dāraquṭnī's موسوعة) first, then the 22 Itqan source_grade books +
 *  newly imported ones, sorted by orientation then author death year so
 *  the UI is consistent across every narrator. Books WITHOUT a verdict
 *  for a given narrator display "—" so the user can scan a stable layout. */
export const ALL_RIJAL_BOOKS: readonly SourceBookMeta[] = [
  // Explicit-quote sources (narrator_grade_source)
  ...["daraqutni_mawsuah", "ibn_hibban_majruhin", "ijli_thiqat"]
    .map((k) => META[k])
    .filter((m): m is SourceBookMeta => Boolean(m)),
  // Itqan source_grade books, sorted by orientation then author death year
  ...Object.values(META)
    .filter((m) => !["daraqutni_mawsuah", "ibn_hibban_majruhin", "ijli_thiqat"].includes(m.key))
    .sort((a, b) => {
      const ad = parseInt(a.authorDeath, 10) || 9999;
      const bd = parseInt(b.authorDeath, 10) || 9999;
      return ad - bd;
    }),
];
