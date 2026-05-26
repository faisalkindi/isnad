import {
  segmentIsnad,
  formulaStrength,
  type ReceiveFormula,
} from "./segment";
import { findCandidates, type NarratorCandidate } from "./candidates";
import { callClaude } from "../claude";
import { getCached, setCached, inputHash } from "./cache";
import { checkLink, type LinkStatus } from "./chronology";
import { findHadithMatches, type HadithMatch } from "./corpus";
import { alignAndCount } from "./chain-align";
import { detectNisbah, type NisbahResult } from "./nisbah";
import {
  classifyByNumber,
  classifySaqt,
  isMursal,
  refineRank,
  classifyAcceptance,
  detectTanReasons,
  type NumberClassification,
  type SaqtClassification,
  type RankClassification,
  type AcceptanceClassification,
  type TanReason,
} from "./classify";
import { query } from "../db";
import { normalizeArabic } from "../normalize";
export type { HadithMatch } from "./corpus";
export type { ReceiveFormula } from "./segment";
export type { NisbahResult, NisbahType } from "./nisbah";
export type {
  NumberClassification,
  NumberClass,
  SaqtClassification,
  SaqtType,
  RankClassification,
  RankRefinement,
  AcceptanceClassification,
  Acceptance,
  TanReason,
} from "./classify";
export { TAN_LABELS } from "./classify";

export type MatchStatus = "matched" | "needs_review" | "not_found";
export type Confidence = "high" | "medium" | "low";

export interface MatchedNarrator {
  position: number;
  fragment: string;
  status: MatchStatus;
  /** The chosen narrator, or null when unresolved. */
  narrator: NarratorCandidate | null;
  confidence: Confidence | null;
  /** All retrieved candidates — drives the correction UI. */
  candidates: NarratorCandidate[];
  /** The transmission formula this narrator used to receive from the next
   *  (older) narrator. null on the oldest narrator and on the Prophet. */
  formula: ReceiveFormula | null;
  /** True for the synthetic Prophet ﷺ node (the source of every chain). */
  is_source?: boolean;
}

/** Verdicts mapped to the classical conditions of حديث صحيح (Ibn al-Ṣalāḥ):
 *    اتصال الإسناد + العدالة + الضبط + عدم الشذوذ + عدم العلة.
 *  The app judges the first three; شذوذ/علة need a scholar — so the positive
 *  verdicts are stated as "بظاهر الإسناد" (by the apparent isnād). */
export type ChainVerdict =
  | "sahih_candidate"
  | "hasan_candidate"
  | "daif"
  | "broken"
  | "needs_review";

export interface CoOccurrence {
  /** Total number of hadiths in the corpus mentioning BOTH narrator names. */
  total: number;
  /** Per-book breakdown (top books by count). */
  books: { book_id: string; book_name_ar: string; count: number }[];
}

export interface GeoOverlap {
  /** "overlap" = at least one common city; "no_overlap" = both have cities
   *  but no common ones; "unknown" = one or both have no city data. */
  status: "overlap" | "no_overlap" | "unknown";
  /** The cities both narrators are recorded as having lived in or visited. */
  shared: string[];
}

export interface ChainLink {
  from_position: number;
  to_position: number;
  status: LinkStatus;
  reason: string;
  /** Approximate corpus co-occurrence — null when one of the narrators has no
   *  distinct name (too generic to substring-match safely). */
  cooccurrence?: CoOccurrence | null;
  /** The transmission formula the student used (captured by the segmenter). */
  formula?: ReceiveFormula | null;
  /** Classification of the formula's strength for samāʿ verification. */
  formulaStrength?: "explicit" | "ambiguous" | "unknown";
  /** True when the student is a tier-3+ mudallis AND used an ambiguous
   *  formula — Bukhārī/Muslim reject such a link without explicit hearing. */
  tadlisConcern?: boolean;
  /** Geographic plausibility — weak signal only (city data is sparse). */
  geo?: GeoOverlap;
  /** Phase 1: classical books that attest this teacher-student edge.
   *  Approximated as the intersection of both narrators' classical_sources. */
  source_books?: string[];
  /** Phase 2: when present, this edge is DOCUMENTED as a non-meeting — al-
   *  Marāsīl or similar primary source explicitly says they didn't hear. */
  documented_non_meeting?: { source_book: string; phrase_ar: string } | null;
  /** Phase 3: strongest verb found for this edge in a primary source. */
  attestation_verb?: {
    verb: "samaa" | "liqa" | "idraka" | "rawa" | "kataba";
    source_book: string;
    phrase_ar: string | null;
  } | null;
}

/** A single detected instance of tadlīs in this chain. */
export interface TadlisInstance {
  /** Type of tadlīs detected. al-Shuyūkh is not auto-detected; this field
   *  is restricted to the two types we can reliably identify. */
  type: "isnad" | "taswiya";
  /** Position of the narrator practicing the tadlīs. */
  narratorPosition: number;
  /** Narrator's name (short form). */
  narratorName: string;
  /** Plain-Arabic explanation of why we flagged this. */
  reason: string;
}

/** Chain-level tadlīs classification («تقسيمات التدليس»). */
export interface TadlisSummary {
  /** Every detected tadlīs instance, with position + reason. */
  instances: TadlisInstance[];
  /** True if any instance is of this type. */
  hasIsnad: boolean;
  /** True if any instance is of this type. */
  hasTaswiya: boolean;
  /** Honest note: al-Shuyūkh cannot be auto-detected from chain text alone. */
  shuyukhNote: string;
}

/** Per-branch analysis result. Most hadiths have a single branch; multi-branch
 *  hadiths (e.g., Muslim's «ح» pattern, or «وعن X» pivot-forks where one rāwī
 *  transmits the same matn through two different teachers) produce N branches
 *  and the final verdict comes from iʿtibār across all of them. */
export interface BranchResult {
  /** Display label for this branch — e.g., "السلسلة الأولى" / "السلسلة الثانية". */
  label: string;
  narrators: MatchedNarrator[];
  links: ChainLink[];
  chain_verdict: ChainVerdict;
  chain_reason: string;
  tadlis: TadlisSummary;
  saqt: SaqtClassification;
  rank: RankClassification;
  acceptance: AcceptanceClassification;
  tanByNarrator: Array<{ position: number; reasons: TanReason[] }>;
}

export interface MatchResult {
  /** All transmission branches for this matn (always >= 1). The legacy
   *  narrators/links/chain_verdict/etc fields below mirror the PRIMARY branch
   *  (the strongest per iʿtibār) so existing consumers keep working. */
  branches: BranchResult[];
  /** True when more than one transmission branch is present and the verdict
   *  has been combined via iʿtibār. */
  has_multiple_branches: boolean;
  /** When iʿtibār upgraded the verdict above the primary-branch verdict, this
   *  explains how (e.g., "ضعيف لذاته في السلسلة الأولى، حسن لغيره بالمتابعة"). */
  itibar_note: string | null;
  // ── Legacy fields, mirroring the primary branch ────────────────────────
  narrators: MatchedNarrator[];
  links: ChainLink[];
  chain_verdict: ChainVerdict;
  chain_reason: string;
  /** The matn extracted from the pasted hadith (empty if isnād-only). */
  matn: string;
  /** Hadiths from the corpus whose text matches the matn. */
  corpus_matches: HadithMatch[];
  /** Classification by ascription («تقسيم الحديث من حيث نسبته إلى قائله»):
   *  مرفوع / موقوف / مقطوع / قدسي. */
  nisbah: NisbahResult;
  /** Chain-level tadlīs types detected («تدليس الإسناد» و«تدليس التسوية»).
   *  «تدليس الشيوخ» is not auto-detected (needs a curated obscure-names DB). */
  tadlis: TadlisSummary;
  /** Number-class: متواتر / مشهور / عزيز / غريب — derived from per-طبقة
   *  distinct-student counts in our transmission graph (Ibn al-Ṣalāḥ's rule
   *  of «الكثرة المستمرة في كل طبقة»). Includes per-level breakdown. */
  number: NumberClassification & { spread: import("./classify").LevelSpread[] };
  /** When verdict is broken, the specific TYPE of break (معلق/مرسل/منقطع/معضل). */
  saqt: SaqtClassification;
  /** Refined verdict distinguishing ṣaḥīḥ/ḥasan لذاته vs لغيره using corpus
   *  corroboration counts. */
  rank: RankClassification;
  /** Binary maqbūl / mardūd tag derived from the refined rank. */
  acceptance: AcceptanceClassification;
  /** Per-narrator: which of the 10 classical asbāb al-ṭaʿn match each
   *  weakened narrator's grade_ar text. */
  tanByNarrator: Array<{ position: number; reasons: TanReason[] }>;
}

interface Decision {
  position: number;
  chosen_id: number | null;
  confidence: string;
}

const DISAMBIG_SYSTEM = `You disambiguate narrators in a hadith isnād.

You are given the ordered name fragments of a chain, and for each position a list
of candidate narrators (id, name, grade, generation, death-year). For each position,
choose the candidate id that best fits given:
 - the surrounding narrators in the chain
 - chronological plausibility — a student must have heard from his teacher, so
   the student's death year is normally within ~80 years of the teacher's. Prefer
   candidates whose dates fit the chain.

CLASSICAL TEACHER-STUDENT HINTS (use when the name is ambiguous):

«سفيان» (Sufyān) — there are TWO classical Sufyāns, both Kūfan:
  - سفيان بن عيينة (Ibn ʿUyaynah, d. 198h, Meccan late-life)
  - سفيان الثوري (al-Thawrī, d. 161h, Kūfan)
  Disambiguate by the IMMEDIATE student:
  → الحميدي عبد الله بن الزبير → ALWAYS Ibn ʿUyaynah (al-Ḥumaydī was his student)
  → الشافعي → ALWAYS Ibn ʿUyaynah
  → ابن المديني (ʿAlī bn al-Madīnī) → usually Ibn ʿUyaynah
  → يحيى القطان, شعبة, أبو نعيم الفضل بن دكين, عبد الرزاق, ابن المبارك, وكيع → usually al-Thawrī
  → ابن مهدي → ambiguous (knew both)

«حماد» (Ḥammād) — two classical Baṣrans:
  - حماد بن سلمة (d. 167h)
  - حماد بن زيد (d. 179h)
  → موسى بن إسماعيل التبوذكي → usually Ibn Salama
  → سليمان بن حرب, عارم محمد بن الفضل → usually Ibn Zayd

«شعبة» without further qualifier → ALWAYS شعبة بن الحجاج (d. 160h).
«مالك» without further qualifier in a hadith chain → ALWAYS مالك بن أنس (d. 179h).
«ابن جريج» → عبد الملك بن عبد العزيز بن جريج (d. 150h).
«الأوزاعي» → عبد الرحمن بن عمرو الأوزاعي (d. 157h).
«الزهري» → محمد بن مسلم بن شهاب الزهري (d. 124h).

If the chain's surrounding context fixes the identity unambiguously per the above hints,
return confidence: "high".

Return ONLY a JSON array, no commentary:
[{"position": <int>, "chosen_id": <int|null>, "confidence": "high"|"medium"|"low"}]

You may ONLY choose an id that appears in that position's candidate list. Use null
only when no candidate is a credible fit.`;

// Strip Islamic honorifics from a fragment before searching. They throw off
// trigram match because of their length.
const HONORIFICS_RX =
  /\s*(?:رضي\s+الله\s+عنه(?:م|ا|ما)?|صلى\s+الله\s+عليه\s+و?سلم|ﷺ|عليه(?:م)?\s+السلام|رحمه\s+الله(?:\s+تعالى)?|تعالى)\s*/g;

function stripHonorifics(fragment: string): string {
  return fragment.replace(HONORIFICS_RX, " ").replace(/\s+/g, " ").trim();
}

function parseDecisions(reply: string): Decision[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is Decision => d && typeof d.position === "number",
    );
  } catch {
    return [];
  }
}

function normalizeConfidence(value: string | undefined): Confidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

// Mapping the classical العدالة/الضبط scale to Itqan's grade buckets:
const SAHIH_GRADES = new Set(["prophet", "companion", "reliable"]); // عدل تام الضبط
const HASAN_GRADES = new Set(["mostly_reliable"]);                   // عدل خفّ ضبطه (صدوق)
const WEAK_GRADES = new Set(["weak", "abandoned", "fabricator"]);    // ضعيف فأدنى

/** App policy — "always apply the harshest jarh available across the 22 books"
 *  (a conservative reading of «الجرح المفسَّر مقدَّم على التعديل»).
 *
 *  Three-stage resolution:
 *    1. Companion carve-out: tabaqat or grade text indicates Companion → عدل
 *    2. Cross-check narrator.grade_ar text for explicit jarh phrases that
 *       the source_grade pipeline may have missed. E.g., Hisham bin ʿAmmār
 *       has narrator.grade_ar="ليس بثقة" (al-Nasāʾī's harsh verdict) but no
 *       source_grade row carries that text — without this fallback the
 *       chain wrongly comes out as ḥasan.
 *    3. Default to harshest_grade_en from source_grade.
 */
const NARRATOR_GRADE_JARH_PATTERNS: Array<[RegExp, string]> = [
  [/كذّ?اب|وضّ?اع|يضع\s+الحديث|دجّ?ال/u, "fabricator"],
  [/متروك|متَّهم\s+بالكذب|ساقط|لا\s+شيء|ليس\s+بشيء/u, "abandoned"],
  [/ليس\s+بثقة|ضعيف|واهي|منكر\s+الحديث|سيّ?ئ\s+الحفظ|لين/u, "weak"],
];
function gradeFromArabicText(g: string): string | null {
  for (const [rx, en] of NARRATOR_GRADE_JARH_PATTERNS) {
    if (rx.test(g)) return en;
  }
  return null;
}
const GRADE_TIER: Record<string, number> = {
  fabricator: 0,
  abandoned: 1,
  weak: 2,
  unknown: 3,
  mostly_reliable: 4,
  reliable: 5,
  companion: 6,
  prophet: 7,
};
function harsher(a: string, b: string): string {
  return (GRADE_TIER[a] ?? 3) <= (GRADE_TIER[b] ?? 3) ? a : b;
}
function effectiveGrade(n: MatchedNarrator): string {
  const t = n.narrator?.tabaqat ?? "";
  const g = n.narrator?.grade_ar ?? "";
  if (/صحاب|صحبة|له\s+رؤية|العشرة/.test(t) || /صحاب|صحبة|له\s+صحبة/.test(g)) {
    return "companion";
  }
  // Policy (user-set): always apply the harshest jarh available, even
  // when it looks like parser noise. Cleaning the underlying data is a
  // separate task — this function does not hide what the DB says.
  const base =
    n.narrator?.harshest_grade_en ??
    n.narrator?.grade_en ??
    "unknown";
  const fromText = gradeFromArabicText(g);
  return fromText ? harsher(base, fromText) : base;
}

/** The Prophet ﷺ is the source of every chain — appended automatically. */
function makeProphet(position: number): MatchedNarrator {
  return {
    position,
    fragment: "رسول الله ﷺ",
    status: "matched",
    narrator: {
      id: -1,
      full_name: "رسول الله ﷺ",
      grade_en: "prophet",
      grade_ar: "المصدر",
      harshest_grade_en: "prophet",
      harshest_grade_ar: null,
      harshest_source_book: null,
      tabaqat: null,
      death: "11 هـ",
      tadlis_tier: null,
      practices_taswiya: false,
      cities: "المدينة، مكة",
      source_verdicts: [],
      top_teachers: [],
      top_students: [],
      score: 1,
    },
    confidence: "high",
    candidates: [],
    formula: null,
    is_source: true,
  };
}

/** Parse a "city1، city2، city3" string into a clean Set, normalizing each
 *  city for comparison. */
function parseCities(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  const out = new Set<string>();
  for (const c of s.split(/[،,;]/)) {
    const t = c.trim();
    if (t && t !== "-") out.add(normalizeArabic(t));
  }
  return out;
}

function computeGeoOverlap(
  studentCities: string | null | undefined,
  teacherCities: string | null | undefined,
): GeoOverlap {
  const s = parseCities(studentCities);
  const t = parseCities(teacherCities);
  if (s.size === 0 || t.size === 0) {
    return { status: "unknown", shared: [] };
  }
  const shared = [...s].filter((c) => t.has(c));
  return {
    status: shared.length > 0 ? "overlap" : "no_overlap",
    shared,
  };
}

/** Reduce a full nasab to a compact "FirstName بن FatherName" form, which is
 *  the way famous narrators are typically cited inside chain text. Falls back
 *  to the first ~25 characters when the structure doesn't match. */
function chainName(fullName: string): string {
  const tokens = fullName.replace(/[،:]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length >= 3 && (tokens[1] === "بن" || tokens[1] === "بنت")) {
    return `${tokens[0]} ${tokens[1]} ${tokens[2]}`;
  }
  return tokens.slice(0, 3).join(" ");
}

const MIN_CHAIN_NAME_LEN = 6; // shorter than this is too ambiguous to search

/** For each (student, teacher) pair, count co-citations in the hadith corpus.
 *  Runs all link queries in parallel. Each query is one sequential scan over
 *  the 112k-row corpus with two ILIKE filters — slow on Neon free tier but
 *  acceptable for the 3–7 links of a typical chain. */
async function fetchCorpusCooccurrence(
  pairs: { studentName: string | null; teacherName: string | null }[],
): Promise<(CoOccurrence | null)[]> {
  return Promise.all(
    pairs.map(async (p) => {
      if (!p.studentName || !p.teacherName) return null;
      const s = normalizeArabic(p.studentName);
      const t = normalizeArabic(p.teacherName);
      if (s.length < MIN_CHAIN_NAME_LEN || t.length < MIN_CHAIN_NAME_LEN) {
        return null;
      }
      try {
        const r = await query<{ book_id: string; book_name_ar: string; c: string }>(
          `SELECT book_id, book_name_ar, count(*)::text AS c
           FROM hadith
           WHERE arabic_normalized LIKE '%' || $1 || '%'
             AND arabic_normalized LIKE '%' || $2 || '%'
           GROUP BY book_id, book_name_ar
           ORDER BY count(*) DESC
           LIMIT 18`,
          [s, t],
        );
        const total = r.rows.reduce((acc, row) => acc + Number(row.c), 0);
        return {
          total,
          books: r.rows.map((row) => ({
            book_id: row.book_id,
            book_name_ar: row.book_name_ar,
            count: Number(row.c),
          })),
        };
      } catch {
        return null;
      }
    }),
  );
}

/**
 * Bulk-fetch the set of (student_id → teacher_id) pairs that are explicitly
 * recorded as teacher-student edges in Itqan's `transmission` table.
 * One round-trip per chain, not per link.
 */
async function fetchAttestedPairs(
  pairs: { studentId: number; teacherId: number }[],
): Promise<Map<string, string[]>> {
  const real = pairs.filter((p) => p.studentId > 0 && p.teacherId > 0);
  if (real.length === 0) return new Map();
  const rows = await query<{
    student_id: number;
    teacher_id: number;
    source_books: string[] | null;
  }>(
    `SELECT t.student_id, t.teacher_id, t.source_books
     FROM transmission t
     WHERE (t.student_id, t.teacher_id) IN (
       SELECT s_id, t_id FROM
         unnest($1::int[], $2::int[]) AS u(s_id, t_id)
     )`,
    [real.map((p) => p.studentId), real.map((p) => p.teacherId)],
  );
  const map = new Map<string, string[]>();
  for (const r of rows.rows) {
    map.set(`${r.student_id}->${r.teacher_id}`, r.source_books ?? []);
  }
  return map;
}

/** Documented non-meetings (Phase 2). If a pair appears in al-Marāsīl or
 *  another primary source as «لم يسمع من X», the chain is BROKEN at that
 *  link no matter what Itqan's transmission table says. */
async function fetchDocumentedNonMeetings(
  pairs: { studentId: number; teacherId: number }[],
): Promise<Map<string, { source_book: string; phrase_ar: string }>> {
  const real = pairs.filter((p) => p.studentId > 0 && p.teacherId > 0);
  if (real.length === 0) return new Map();
  const rows = await query<{
    student_id: number;
    teacher_id: number;
    source_book: string;
    phrase_ar: string;
  }>(
    `SELECT student_id, teacher_id, source_book, phrase_ar
     FROM documented_non_meeting
     WHERE (student_id, teacher_id) IN (
       SELECT s_id, t_id FROM
         unnest($1::int[], $2::int[]) AS u(s_id, t_id)
     )`,
    [real.map((p) => p.studentId), real.map((p) => p.teacherId)],
  );
  const map = new Map<string, { source_book: string; phrase_ar: string }>();
  for (const r of rows.rows) {
    // First win on duplicate (most-cited source).
    if (!map.has(`${r.student_id}->${r.teacher_id}`)) {
      map.set(`${r.student_id}->${r.teacher_id}`, {
        source_book: r.source_book,
        phrase_ar: r.phrase_ar,
      });
    }
  }
  return map;
}

/** Strongest verb (Phase 3) per (student, teacher) edge from
 *  attestation_verb. Ladder: samaa > liqa > idraka > rawa > kataba. */
const VERB_RANK: Record<string, number> = {
  samaa: 5,
  liqa: 4,
  idraka: 3,
  rawa: 2,
  kataba: 1,
};

const VERB_LABEL_AR: Record<string, string> = {
  samaa: "صرَّح بالسماع",
  liqa: "ثبت اللقاء",
  idraka: "أدركه",
  rawa: "روى عنه",
  kataba: "كاتبه",
};

// Use the canonical sourceBookAr() from lib/sources — that file holds the
// full mapping of all 22 rijāl-book keys + the two attestation sources
// (tarikh_kabir, marasil_ibn_abi_hatim) we added in Phases 2/3.
import { sourceBookAr as sourceBookArSafe } from "../sources";

const NON_MEETING_AUTHOR: Record<string, string> = {
  marasil_ibn_abi_hatim: "ابن أبي حاتم",
  jami_al_tahsil: "العلائي",
  tahdhib: "ابن حجر",
};

function nonMeetingAuthor(key: string): string {
  return NON_MEETING_AUTHOR[key] ?? "أئمة الفنّ";
}

function formatSourceBooksCitation(books: string[] | null): string {
  if (!books || books.length === 0) return " في كتب الرجال";
  const top = books.slice(0, 3).map(sourceBookArSafe).map((t) => `«${t}»`);
  return ` في ${top.join(" و")}`;
}

function verbCitationPhrase(av: { verb: AttestationVerb; source_book: string; phrase_ar: string | null }): string {
  const verb = VERB_LABEL_AR[av.verb] ?? av.verb;
  const book = sourceBookArSafe(av.source_book);
  if (av.phrase_ar) return `قال «${book}»: «${av.phrase_ar}» — ${verb}.`;
  return `${verb} (من «${book}»).`;
}

type AttestationVerb = "samaa" | "liqa" | "idraka" | "rawa" | "kataba";
function asAttestationVerb(v: string): AttestationVerb | null {
  return ["samaa", "liqa", "idraka", "rawa", "kataba"].includes(v)
    ? (v as AttestationVerb)
    : null;
}

async function fetchAttestationVerbs(
  pairs: { studentId: number; teacherId: number }[],
): Promise<Map<string, { verb: AttestationVerb; source_book: string; phrase_ar: string | null }>> {
  const real = pairs.filter((p) => p.studentId > 0 && p.teacherId > 0);
  if (real.length === 0) return new Map();
  const rows = await query<{
    student_id: number;
    teacher_id: number;
    verb: string;
    source_book: string;
    phrase_ar: string | null;
  }>(
    `SELECT student_id, teacher_id, verb, source_book, phrase_ar
     FROM attestation_verb
     WHERE (student_id, teacher_id) IN (
       SELECT s_id, t_id FROM
         unnest($1::int[], $2::int[]) AS u(s_id, t_id)
     )`,
    [real.map((p) => p.studentId), real.map((p) => p.teacherId)],
  );
  const map = new Map<string, { verb: AttestationVerb; source_book: string; phrase_ar: string | null }>();
  for (const r of rows.rows) {
    const verb = asAttestationVerb(r.verb);
    if (!verb) continue;
    const key = `${r.student_id}->${r.teacher_id}`;
    const cur = map.get(key);
    if (!cur || (VERB_RANK[verb] ?? 0) > (VERB_RANK[cur.verb] ?? 0)) {
      map.set(key, {
        verb,
        source_book: r.source_book,
        phrase_ar: r.phrase_ar,
      });
    }
  }
  return map;
}

async function computeLinks(
  narrators: MatchedNarrator[],
): Promise<ChainLink[]> {
  // Collect every (student, teacher) pair we'll need to verify.
  const pairs: { studentId: number; teacherId: number }[] = [];
  const namePairs: { studentName: string | null; teacherName: string | null }[] = [];
  for (let i = 0; i < narrators.length - 1; i++) {
    const student = narrators[i].narrator;
    const teacher = narrators[i + 1].narrator;
    if (student && teacher) {
      pairs.push({ studentId: student.id, teacherId: teacher.id });
      namePairs.push({
        studentName: chainName(student.full_name),
        teacherName: chainName(teacher.full_name),
      });
    } else {
      namePairs.push({ studentName: null, teacherName: null });
    }
  }
  // All four lookups run in parallel.
  const [attested, cooccurrences, nonMeetings, attVerbs] = await Promise.all([
    fetchAttestedPairs(pairs),
    fetchCorpusCooccurrence(namePairs),
    fetchDocumentedNonMeetings(pairs),
    fetchAttestationVerbs(pairs),
  ]);

  const links: ChainLink[] = [];
  for (let i = 0; i < narrators.length - 1; i++) {
    const student = narrators[i].narrator;
    const teacher = narrators[i + 1].narrator;
    const co = cooccurrences[i] ?? null;
    const formula = narrators[i].formula ?? null;
    const strength = formulaStrength(formula);
    const geo = computeGeoOverlap(student?.cities, teacher?.cities);
    // Tadlis concern: the STUDENT is a tier-3+ mudallis AND he used an
    // ambiguous formula (عن / أن / قال). This is the classical risk Bukhārī
    // and Muslim guard against; it makes the link weaker even if chronology
    // and attestation are otherwise fine.
    const tadlisConcern =
      student != null &&
      student.tadlis_tier != null &&
      student.tadlis_tier >= 3 &&
      strength === "ambiguous";

    if (!student || !teacher) {
      links.push({
        from_position: i,
        to_position: i + 1,
        status: "unknown",
        reason: "أحد الراويين لم يُعرَف.",
        cooccurrence: co,
        formula,
        formulaStrength: strength,
        tadlisConcern,
        geo,
      });
      continue;
    }
    const chron = checkLink(
      { death: student.death },
      { death: teacher.death },
    );
    // Chronology trumps attestation: if a recorded edge says they met but the
    // death years rule it out, we trust the math. (This shouldn't normally
    // happen — it would signal bad data in either Itqan's transmission table
    // or the matched narrator IDs.)
    if (chron.status === "impossible") {
      links.push({
        from_position: i,
        to_position: i + 1,
        status: "impossible",
        reason: chron.reason,
        cooccurrence: co,
        formula,
        formulaStrength: strength,
        tadlisConcern,
        geo,
      });
      continue;
    }
    const pairKey = `${student.id}->${teacher.id}`;
    const sourceBooks = attested.get(pairKey) ?? null;
    const isAttested = sourceBooks !== null;
    const nonMeeting = nonMeetings.get(pairKey) ?? null;
    const attVerb = attVerbs.get(pairKey) ?? null;

    // Documented non-meeting overrides everything — chronology + attestation.
    if (nonMeeting) {
      links.push({
        from_position: i,
        to_position: i + 1,
        status: "impossible",
        reason: `أثبت ${nonMeetingAuthor(nonMeeting.source_book)} في «${sourceBookArSafe(nonMeeting.source_book)}» أن هذه الصلة منقطعة: «${nonMeeting.phrase_ar}».`,
        cooccurrence: co,
        formula,
        formulaStrength: strength,
        tadlisConcern,
        geo,
        documented_non_meeting: nonMeeting,
        attestation_verb: attVerb,
        source_books: sourceBooks ?? undefined,
      });
      continue;
    }

    let baseReason: string;
    let baseStatus: LinkStatus;
    if (isAttested) {
      baseStatus = "attested";
      const bookCitation = formatSourceBooksCitation(sourceBooks);
      const verbCitation = attVerb
        ? ` ${verbCitationPhrase(attVerb)}`
        : "";
      baseReason =
        chron.status === "possible"
          ? `علاقة شيخ-تلميذ موثَّقة${bookCitation}، والوفاتان منسجمتان.${verbCitation}`
          : `علاقة شيخ-تلميذ موثَّقة${bookCitation}.${verbCitation}`;
    } else {
      baseStatus = chron.status;
      baseReason = chron.reason;
    }
    if (tadlisConcern) {
      // Bukhārī-grade samaa attestation absolves the مدلس warning per
      // classical methodology («إذا صرَّح بالسماع زال التدليس»).
      const samaaProven = attVerb?.verb === "samaa";
      if (!samaaProven) {
        baseReason +=
          ` ⚠ الراوي مدلِّس من المرتبة ${student.tadlis_tier}، وقد ` +
          `استعمل صيغة محتملة («عن» أو «قال» أو «أنّ») دون تصريح بالسماع — ` +
          `يُتوقَّف في قبول الرواية حتى يُعرف سماعه.`;
      }
    }
    links.push({
      from_position: i,
      to_position: i + 1,
      status: baseStatus,
      reason: baseReason,
      cooccurrence: co,
      formula,
      formulaStrength: strength,
      tadlisConcern: tadlisConcern && attVerb?.verb !== "samaa",
      source_books: sourceBooks ?? undefined,
      documented_non_meeting: null,
      attestation_verb: attVerb,
      geo,
    });
  }
  return links;
}

function chainVerdict(
  narrators: MatchedNarrator[],
  links: ChainLink[],
): { verdict: ChainVerdict; reason: string } {
  // 1. اتصال — any chronologically impossible link breaks the chain.
  if (links.some((l) => l.status === "impossible")) {
    return {
      verdict: "broken",
      reason:
        "لم يتحقّق شرط الاتصال — يوجد انقطاع زمني محقّق بين بعض الرواة.",
    };
  }

  // 2. العدالة والضبط — any clearly weak narrator drops the chain to ضعيف.
  const hasWeak = narrators.some(
    (n) => n.narrator && WEAK_GRADES.has(effectiveGrade(n)),
  );
  if (hasWeak) {
    return {
      verdict: "daif",
      reason:
        "في الإسناد راوٍ ضعيف أو متروك أو متهم بالكذب — لم يتحقّق شرط العدالة والضبط.",
    };
  }

  // 3. Incomplete data — unmatched narrators OR any link still `unknown`.
  //    Attested and possible both count as "the chronology is OK"; only
  //    `unknown` (missing death years) blocks the verdict.
  const allMatched = narrators.every((n) => n.status === "matched");
  const noUnknownLinks = links.every(
    (l) => l.status === "attested" || l.status === "possible",
  );
  if (!allMatched || !noUnknownLinks) {
    return {
      verdict: "needs_review",
      reason:
        "بعض الرواة لم يُعرفوا أو بعض التواريخ غير مذكورة — يتعذّر الحكم.",
    };
  }

  // How many links are attested by the rijāl literature? How many at the
  // strongest Bukhārī-grade (explicit samaa from al-Tarikh al-Kabir)?
  const attestedCount = links.filter((l) => l.status === "attested").length;
  const samaaCount = links.filter((l) => l.attestation_verb?.verb === "samaa").length;
  const allAttested = links.length > 0 && attestedCount === links.length;
  const allSamaa = links.length > 0 && samaaCount === links.length;
  const attestationSuffix = allSamaa
    ? " وكلّ صلات السلسلة ثَبَتَ فيها السماع صراحةً في «التاريخ الكبير للبخاري» (أعلى درجات الإثبات — شرط البخاري)."
    : samaaCount > 0
      ? ` و${samaaCount} من ${links.length} من صلات السلسلة ثَبَتَ فيها السماع صراحةً في «التاريخ الكبير».`
      : allAttested
        ? " وكل صلات السلسلة موثَّقة في كتب الرجال (شرط البخاري في ثبوت اللقاء)."
        : attestedCount > 0
          ? ` و${attestedCount} من ${links.length} من صلات السلسلة موثَّقة في كتب الرجال.`
          : "";

  // 4. Every narrator is ثقة or أعلى, every link confirmed → ظاهره الصحة.
  const allSahih = narrators.every(
    (n) => n.narrator && SAHIH_GRADES.has(effectiveGrade(n)),
  );
  if (allSahih) {
    return {
      verdict: "sahih_candidate",
      reason:
        "اتصل الإسناد بنقل العدل الضابط عن العدل الضابط إلى منتهاه. تتحقّق الشروط الظاهرة للصحّة." +
        attestationSuffix,
    };
  }

  // 5. Otherwise at least one صدوق narrator — حسن لذاته بظاهر الإسناد.
  return {
    verdict: "hasan_candidate",
    reason:
      "اتصل الإسناد وكلّ رواته صدوقون فأعلى — تتحقّق شروط الحسن لذاته بظاهر الإسناد." +
      attestationSuffix,
  };
}

/**
 * Identify every narrator in a pasted isnād.
 * Two-stage hybrid: deterministic candidate retrieval, then a single Claude
 * call to disambiguate using chain context. A chosen id that is not among the
 * retrieved candidates is rejected (hallucination guard) and the position is
 * flagged for human review.
 */
interface BranchContext {
  rawText: string;
  matn: string;
  corpus_matches: HadithMatch[];
  aligned: Awaited<ReturnType<typeof alignAndCount>> | null;
  label: string;
}

async function processOneBranch(
  fragments: string[],
  formulas: (ReceiveFormula | null)[],
  ctx: BranchContext,
): Promise<{ branch: BranchResult; nisbah: NisbahResult }> {
  const searchFragments = fragments.map(stripHonorifics);
  const candidatesPerPosition = await Promise.all(
    searchFragments.map((fragment) => findCandidates(fragment)),
  );

  let decisions: Decision[] = [];
  if (candidatesPerPosition.some((c) => c.length > 0)) {
    const promptData = fragments.map((fragment, i) => ({
      position: i,
      fragment,
      candidates: candidatesPerPosition[i].map((c) => ({
        id: c.id,
        name: c.full_name,
        grade: c.grade_en,
        generation: c.tabaqat,
        death: c.death,
      })),
    }));
    const reply = await callClaude(JSON.stringify(promptData), {
      system: DISAMBIG_SYSTEM,
      maxTokens: 2048,
    });
    decisions = parseDecisions(reply);
  }

  const narrators: MatchedNarrator[] = fragments.map((fragment, i) => {
    const candidates = candidatesPerPosition[i];
    const formula = formulas[i];
    if (candidates.length === 0) {
      return {
        position: i,
        fragment,
        status: "not_found",
        narrator: null,
        confidence: null,
        candidates: [],
        formula,
      };
    }
    const decision = decisions.find((d) => d.position === i);
    const chosenId = decision?.chosen_id ?? null;
    const chosen =
      chosenId != null ? candidates.find((c) => c.id === chosenId) : undefined;
    if (!chosen) {
      return {
        position: i,
        fragment,
        status: "needs_review",
        narrator: null,
        confidence: null,
        candidates,
        formula,
      };
    }
    return {
      position: i,
      fragment,
      status: "matched",
      narrator: chosen,
      confidence: normalizeConfidence(decision?.confidence),
      candidates,
      formula,
    };
  });

  const lastMatched = [...narrators].reverse().find((n) => n.narrator) ?? null;
  const nisbah = detectNisbah({
    rawText: ctx.rawText,
    matn: ctx.matn,
    lastNarrator: lastMatched?.narrator
      ? {
          tabaqat: lastMatched.narrator.tabaqat,
          grade_ar: lastMatched.narrator.grade_ar,
          grade_en: lastMatched.narrator.grade_en,
        }
      : null,
  });

  const isRaisedToProphet =
    nisbah.type === "marfu_sarih" ||
    nisbah.type === "marfu_hukman" ||
    nisbah.type === "qudsi";
  const fullNarrators =
    narrators.length > 0 && isRaisedToProphet
      ? [...narrators, makeProphet(narrators.length)]
      : narrators;

  const links = await computeLinks(fullNarrators);
  const baseVerdict = chainVerdict(fullNarrators, links);

  let finalReason = baseVerdict.reason;
  if (!isRaisedToProphet && lastMatched?.narrator) {
    if (nisbah.type === "mawquf") {
      finalReason = baseVerdict.reason.replace(
        /اتصل\s+الإسناد[^.]*\.?/,
        `اتصل الإسناد إلى ${lastMatched.narrator.full_name.slice(0, 40)} (موقوفًا عليه).`,
      );
    } else if (nisbah.type === "maqtu") {
      finalReason = baseVerdict.reason.replace(
        /اتصل\s+الإسناد[^.]*\.?/,
        `اتصل الإسناد إلى ${lastMatched.narrator.full_name.slice(0, 40)} (مقطوعًا عليه).`,
      );
    }
  }

  const tadlisInstances: TadlisInstance[] = [];
  for (const link of links) {
    if (link.tadlisConcern) {
      const n = fullNarrators[link.from_position];
      if (n?.narrator) {
        tadlisInstances.push({
          type: "isnad",
          narratorPosition: link.from_position,
          narratorName: n.narrator.full_name.split(/\s+بن\s+/).slice(0, 2).join(" بن "),
          reason: `الراوي مدلِّس من المرتبة ${n.narrator.tadlis_tier} واستعمل صيغة محتملة (${link.formula ?? "—"}) دون تصريح بالسماع.`,
        });
      }
    }
  }
  for (const n of fullNarrators) {
    if (n.narrator?.practices_taswiya && formulaStrength(n.formula) === "ambiguous") {
      tadlisInstances.push({
        type: "taswiya",
        narratorPosition: n.position,
        narratorName: n.narrator.full_name.split(/\s+بن\s+/).slice(0, 2).join(" بن "),
        reason: "هذا الراوي معروفٌ بتدليس التسوية (إسقاط الضعيف بين ثقتين)، وقد استعمل صيغة محتملة في هذا الإسناد.",
      });
    }
  }
  const tadlis: TadlisSummary = {
    instances: tadlisInstances,
    hasIsnad: tadlisInstances.some((t) => t.type === "isnad"),
    hasTaswiya: tadlisInstances.some((t) => t.type === "taswiya"),
    shuyukhNote:
      "كشف تدليس الشيوخ آليًّا يحتاج إلى قاعدة بيانات للأسماء الغامضة — غير متوفِّر حاليًا.",
  };

  let saqt = classifySaqt(fullNarrators, links);
  if (saqt.type === "none" && isMursal(fullNarrators, isRaisedToProphet)) {
    saqt = {
      type: "mursal",
      label: "مرسل",
      reason:
        "أسنده تابعيٌّ إلى النبي ﷺ مباشرةً دون ذكر الصحابي الواسطة — مرسل.",
    };
  }

  const rank = refineRank(baseVerdict.verdict, ctx.corpus_matches, ctx.aligned);
  const acceptance = classifyAcceptance(rank.type);

  const tanByNarrator = fullNarrators
    .map((n) => ({
      position: n.position,
      reasons: detectTanReasons(n.narrator?.grade_ar),
    }))
    .filter((x) => x.reasons.length > 0);

  return {
    branch: {
      label: ctx.label,
      narrators: fullNarrators,
      links,
      chain_verdict: baseVerdict.verdict,
      chain_reason: finalReason,
      tadlis,
      saqt,
      rank,
      acceptance,
      tanByNarrator,
    },
    nisbah,
  };
}

/** Iʿtibār — pick the strongest branch and note any upgrade. Classical rule:
 *   - sahih/hasan li-dhātih in any branch wins
 *   - if all branches are ḍaʿīf but the defects are sūʾ-ḥifẓ/dabt only (not
 *     adala defects like kidhb / tuhmat / fisq), then 2+ independent ḍaʿīf
 *     branches together can be ḥasan li-ghayrihi (Ibn al-Ṣalāḥ, Bayhaqī,
 *     Ṭāriq ʿAwaḍ Allāh). Adala defects do NOT benefit from iʿtibār.
 *   - broken in all branches stays broken. */
function pickPrimaryBranch(branches: BranchResult[]): number {
  const rank: Record<ChainVerdict, number> = {
    sahih_candidate: 0,
    hasan_candidate: 1,
    daif: 2,
    needs_review: 3,
    broken: 4,
  };
  let best = 0;
  for (let i = 1; i < branches.length; i++) {
    if (rank[branches[i].chain_verdict] < rank[branches[best].chain_verdict]) {
      best = i;
    }
  }
  return best;
}

function computeItibarNote(branches: BranchResult[], primary: number): string | null {
  if (branches.length < 2) return null;
  const primaryVerdict = branches[primary].chain_verdict;
  const stronger = branches.filter((b, i) => i !== primary && b.chain_verdict !== "broken");
  if (stronger.length === 0) return null;
  // The simplest case: multiple branches reach hasan+. Note the corroboration.
  if (primaryVerdict === "hasan_candidate" || primaryVerdict === "sahih_candidate") {
    const corroborating = branches.filter(
      (b, i) =>
        i !== primary &&
        (b.chain_verdict === "hasan_candidate" || b.chain_verdict === "sahih_candidate"),
    );
    if (corroborating.length > 0) {
      return `تأكَّد الحُكم بمتابعةِ ${corroborating.length === 1 ? "السلسلة الأخرى" : `${corroborating.length} سلاسل أخرى`} (اعتبار).`;
    }
  }
  // ḍaʿīf primary + another hasan+ branch → the OTHER branch should be primary.
  // pickPrimaryBranch already selects the strongest, so this only fires if we
  // changed sort order. Defensive note.
  return null;
}

export async function matchChain(rawText: string): Promise<MatchResult> {
  const hash = inputHash(rawText);
  const cached = await getCached(hash);
  if (cached) return cached;

  const segmented = await segmentIsnad(rawText);
  const matn = segmented.matn;
  const branchInputs = segmented.branches;

  // Matn-level work — computed once and shared across branches.
  const corpus_matches = matn ? await findHadithMatches(matn) : [];
  const aligned = corpus_matches.length > 0 ? await alignAndCount(corpus_matches) : null;

  // Process every branch (single-chain hadiths still go through this loop
  // with branchInputs.length === 1).
  const branchOutputs = await Promise.all(
    branchInputs.map((b, i) =>
      processOneBranch(
        b.narrators.map((n) => n.name),
        b.narrators.map((n) => n.formula),
        {
          rawText,
          matn,
          corpus_matches,
          aligned,
          label: branchInputs.length === 1
            ? "السلسلة"
            : ["السلسلة الأولى", "السلسلة الثانية", "السلسلة الثالثة", "السلسلة الرابعة"][i] ?? `السلسلة ${i + 1}`,
        },
      ),
    ),
  );
  const branches = branchOutputs.map((o) => o.branch);
  // nisbah is matn-level — branches almost always agree. Use first branch's.
  const nisbah = branchOutputs[0].nisbah;

  const primaryIdx = pickPrimaryBranch(branches);
  const primary = branches[primaryIdx];
  const itibar_note = computeItibarNote(branches, primaryIdx);

  // number-class uses the union of all branches' narrators for spread counting.
  const allFullNarrators = branches.flatMap((b) => b.narrators);
  const numberClass = classifyByNumber(allFullNarrators, aligned, corpus_matches);

  const result: MatchResult = {
    branches,
    has_multiple_branches: branches.length > 1,
    itibar_note,
    narrators: primary.narrators,
    links: primary.links,
    chain_verdict: primary.chain_verdict,
    chain_reason: primary.chain_reason,
    matn,
    corpus_matches,
    nisbah,
    tadlis: primary.tadlis,
    number: numberClass,
    saqt: primary.saqt,
    rank: primary.rank,
    acceptance: primary.acceptance,
    tanByNarrator: primary.tanByNarrator,
  };
  await setCached(hash, result);
  return result;
}
