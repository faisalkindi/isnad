import { segmentIsnad } from "./segment";
import { findCandidates, type NarratorCandidate } from "./candidates";
import { callClaude } from "../claude";
import { getCached, setCached, inputHash } from "./cache";
import { checkLink, type LinkStatus } from "./chronology";
import { findHadithMatches, type HadithMatch } from "./corpus";
export type { HadithMatch } from "./corpus";

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
  /** True for the synthetic Prophet ﷺ node (the source of every chain). */
  is_source?: boolean;
}

export type ChainVerdict = "trustworthy_candidate" | "broken" | "needs_review";

export interface ChainLink {
  from_position: number;
  to_position: number;
  status: LinkStatus;
  reason: string;
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
of candidate narrators (id, name, grade, generation). For each position, choose the
candidate id that best fits given the surrounding narrators in the chain, or null if
none is a credible fit.

Return ONLY a JSON array, no commentary:
[{"position": <int>, "chosen_id": <int|null>, "confidence": "high"|"medium"|"low"}]

You may ONLY choose an id that appears in that position's candidate list.`;

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

const RELIABLE_GRADES = new Set([
  "prophet",
  "companion",
  "reliable",
  "mostly_reliable",
]);

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
      tabaqat: null,
      death: "11 هـ",
      score: 1,
    },
    confidence: "high",
    candidates: [],
    is_source: true,
  };
}

function computeLinks(narrators: MatchedNarrator[]): ChainLink[] {
  const links: ChainLink[] = [];
  for (let i = 0; i < narrators.length - 1; i++) {
    const student = narrators[i].narrator;
    const teacher = narrators[i + 1].narrator;
    if (!student || !teacher) {
      links.push({
        from_position: i,
        to_position: i + 1,
        status: "unknown",
        reason: "أحد الراويين لم يُعرَف.",
      });
      continue;
    }
    const r = checkLink(
      { death: student.death },
      { death: teacher.death },
    );
    links.push({
      from_position: i,
      to_position: i + 1,
      status: r.status,
      reason: r.reason,
    });
  }
  return links;
}

function chainVerdict(
  narrators: MatchedNarrator[],
  links: ChainLink[],
): { verdict: ChainVerdict; reason: string } {
  if (links.some((l) => l.status === "impossible")) {
    return {
      verdict: "broken",
      reason: "السلسلة منقطعة — يوجد انقطاع زمني محقّق بين بعض الرواة.",
    };
  }
  const allMatched = narrators.every((n) => n.status === "matched");
  const allReliable = narrators.every(
    (n) =>
      n.narrator && RELIABLE_GRADES.has(n.narrator.grade_en ?? ""),
  );
  const allLinksConfirmed = links.every((l) => l.status === "possible");
  if (allMatched && allReliable && allLinksConfirmed) {
    return {
      verdict: "trustworthy_candidate",
      reason: "كل الرواة معروفون وموثَّقون، والاتصال محتمل بين كل طبقتين.",
    };
  }
  return {
    verdict: "needs_review",
    reason: "السلسلة تحتاج إلى مراجعة — راجع الرواة والروابط.",
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
  const fragments = segmented.narrators;
  const matn = segmented.matn;

  const candidatesPerPosition = await Promise.all(
    fragments.map((fragment) => findCandidates(fragment)),
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
    if (candidates.length === 0) {
      return {
        position: i,
        fragment,
        status: "not_found",
        narrator: null,
        confidence: null,
        candidates: [],
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
      };
    }

    return {
      position: i,
      fragment,
      status: "matched",
      narrator: chosen,
      confidence: normalizeConfidence(decision?.confidence),
      candidates,
    };
  });

  // Append the Prophet ﷺ as the source of the chain. Every hadith ends at him.
  const fullNarrators =
    narrators.length > 0 ? [...narrators, makeProphet(narrators.length)] : narrators;

  const links = computeLinks(fullNarrators);
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
