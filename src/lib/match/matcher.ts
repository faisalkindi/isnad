import { segmentIsnad } from "./segment";
import { findCandidates, type NarratorCandidate } from "./candidates";
import { callClaude } from "../claude";

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
}

export interface MatchResult {
  narrators: MatchedNarrator[];
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

/**
 * Identify every narrator in a pasted isnād.
 * Two-stage hybrid: deterministic candidate retrieval, then a single Claude
 * call to disambiguate using chain context. A chosen id that is not among the
 * retrieved candidates is rejected (hallucination guard) and the position is
 * flagged for human review.
 */
export async function matchChain(rawText: string): Promise<MatchResult> {
  const fragments = await segmentIsnad(rawText);

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

  return { narrators };
}
