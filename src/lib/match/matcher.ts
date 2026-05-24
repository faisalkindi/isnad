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
import { query } from "../db";
import { normalizeArabic } from "../normalize";
export type { HadithMatch } from "./corpus";
export type { ReceiveFormula } from "./segment";

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
}

export interface MatchResult {
  narrators: MatchedNarrator[];
  links: ChainLink[];
  chain_verdict: ChainVerdict;
  chain_reason: string;
  /** The matn extracted from the pasted hadith (empty if isnād-only). */
  matn: string;
  /** Hadiths from the corpus whose text matches the matn. */
  corpus_matches: HadithMatch[];
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
 *  Carve-out: الصحابة كلّهم عدول. If the narrator is identified as a Companion
 *  by tabaqat or grade text, treat him as such regardless of any later
 *  criticism (Companions are not subject to jarḥ by classical consensus). */
function effectiveGrade(n: MatchedNarrator): string {
  const t = n.narrator?.tabaqat ?? "";
  const g = n.narrator?.grade_ar ?? "";
  if (/صحاب|صحبة|له\s+رؤية/.test(t) || /صحاب|صحبة|له\s+صحبة/.test(g)) {
    return "companion";
  }
  return (
    n.narrator?.harshest_grade_en ??
    n.narrator?.grade_en ??
    ""
  );
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
      cities: "المدينة، مكة",
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
): Promise<Set<string>> {
  const real = pairs.filter((p) => p.studentId > 0 && p.teacherId > 0);
  if (real.length === 0) return new Set();
  const rows = await query<{ student_id: number; teacher_id: number }>(
    `SELECT t.student_id, t.teacher_id
     FROM transmission t
     WHERE (t.student_id, t.teacher_id) IN (
       SELECT s_id, t_id FROM
         unnest($1::int[], $2::int[]) AS u(s_id, t_id)
     )`,
    [real.map((p) => p.studentId), real.map((p) => p.teacherId)],
  );
  const set = new Set<string>();
  for (const r of rows.rows) set.add(`${r.student_id}->${r.teacher_id}`);
  return set;
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
  // Both lookups run in parallel: transmission edges (fast, one round-trip)
  // and corpus co-occurrence (slow, N round-trips, one per link).
  const [attested, cooccurrences] = await Promise.all([
    fetchAttestedPairs(pairs),
    fetchCorpusCooccurrence(namePairs),
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
    const isAttested = attested.has(`${student.id}->${teacher.id}`);
    let baseReason: string;
    let baseStatus: LinkStatus;
    if (isAttested) {
      baseStatus = "attested";
      baseReason =
        chron.status === "possible"
          ? "علاقة شيخ-تلميذ موثَّقة في كتب الرجال، والوفاتان منسجمتان."
          : "علاقة شيخ-تلميذ موثَّقة في كتب الرجال.";
    } else {
      baseStatus = chron.status;
      baseReason = chron.reason;
    }
    if (tadlisConcern) {
      baseReason +=
        ` ⚠ الراوي مدلِّس من المرتبة ${student.tadlis_tier}، وقد ` +
        `استعمل صيغة محتملة («عن» أو «قال» أو «أنّ») دون تصريح بالسماع — ` +
        `يُتوقَّف في قبول الرواية حتى يُعرف سماعه.`;
    }
    links.push({
      from_position: i,
      to_position: i + 1,
      status: baseStatus,
      reason: baseReason,
      cooccurrence: co,
      formula,
      formulaStrength: strength,
      tadlisConcern,
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

  // How many links are attested by the rijāl literature?
  const attestedCount = links.filter((l) => l.status === "attested").length;
  const allAttested = links.length > 0 && attestedCount === links.length;
  const attestationSuffix = allAttested
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
export async function matchChain(rawText: string): Promise<MatchResult> {
  const hash = inputHash(rawText);
  const cached = await getCached(hash);
  if (cached) return cached;

  const segmented = await segmentIsnad(rawText);
  const fragments = segmented.narrators.map((n) => n.name);
  const formulas: (ReceiveFormula | null)[] = segmented.narrators.map(
    (n) => n.formula,
  );
  const matn = segmented.matn;

  // Strip honorifics (رضي الله عنه, ﷺ, …) before searching — they wreck
  // trigram match. Keep the originals for display.
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
      // No decision, or a hallucinated id not in the candidate list.
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

  // Append the Prophet ﷺ as the source of the chain. Every hadith ends at him.
  const fullNarrators =
    narrators.length > 0 ? [...narrators, makeProphet(narrators.length)] : narrators;

  const links = await computeLinks(fullNarrators);
  const { verdict, reason } = chainVerdict(fullNarrators, links);
  const corpus_matches = matn ? await findHadithMatches(matn) : [];
  const result: MatchResult = {
    narrators: fullNarrators,
    links,
    chain_verdict: verdict,
    chain_reason: reason,
    matn,
    corpus_matches,
  };
  await setCached(hash, result);
  return result;
}
