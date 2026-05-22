import { createHash } from "node:crypto";
import { query } from "../db";
import { normalizeArabic } from "../normalize";
import type { MatchResult } from "./matcher";

/** Stable cache key for a pasted isnād (normalized so trivial variations hit). */
export function inputHash(rawText: string): string {
  return createHash("sha256").update(normalizeArabic(rawText)).digest("hex");
}

export async function getCached(hash: string): Promise<MatchResult | null> {
  const res = await query<{ result: MatchResult }>(
    "SELECT result FROM match_cache WHERE input_hash = $1",
    [hash],
  );
  return res.rows[0]?.result ?? null;
}

export async function setCached(
  hash: string,
  result: MatchResult,
): Promise<void> {
  await query(
    `INSERT INTO match_cache (input_hash, result) VALUES ($1, $2)
     ON CONFLICT (input_hash) DO UPDATE
       SET result = $2, created_at = now()`,
    [hash, JSON.stringify(result)],
  );
}
