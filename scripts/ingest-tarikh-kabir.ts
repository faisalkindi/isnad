// Phase 3 ingestion: load al-Tārīkh al-Kabīr verb-attestation records into
// the attestation_verb table.
//
// Sequential + checkpointed strategy:
//   - Process entries one at a time (not bulk)
//   - Cache name → id resolutions in memory
//   - Insert immediately after each match
//   - Print progress every 100 entries to stderr (line-buffered when piped)
//   - Safe to interrupt + resume (ON CONFLICT DO NOTHING)
//
// Run: npx tsx scripts/ingest-tarikh-kabir.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { normalizeArabic } from "../src/lib/normalize";

config({ path: ".env.local" });

type Verb = "samaa" | "liqa" | "idraka" | "rawa" | "kataba";
interface RawEntry {
  narrator_name_ar: string;
  verb: Verb;
  other_party_name_ar: string;
  phrase_ar: string;
  biography_index: number;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 20, // Neon Launch plan, 16 CU autoscale headroom.
});

const FILE = join(process.cwd(), "data", "tarikh_kabir", "tarikh_kabir_attestations.json");
const SOURCE_BOOK_KEY = "tarikh_kabir";
const SIM_THRESHOLD = 0.7;
const PARALLEL = 16;
const PER_QUERY_TIMEOUT_MS = 1500;

const log = (s: string) => process.stderr.write(s + "\n");
const matchCache = new Map<string, number | null>();

async function matchOne(name: string): Promise<number | null> {
  const norm = normalizeArabic(name).trim();
  if (norm.length < 3) return null;
  if (matchCache.has(norm)) return matchCache.get(norm)!;
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = '${PER_QUERY_TIMEOUT_MS}ms'`);
    const r = await client.query<{ narrator_id: number; score: number }>(
      `SELECT narrator_id, similarity(normalized_variant, $1) AS score
         FROM name_variant
        WHERE normalized_variant % $1
        ORDER BY similarity(normalized_variant, $1) DESC
        LIMIT 1`,
      [norm],
    );
    const id = r.rows.length === 0 || Number(r.rows[0].score) < SIM_THRESHOLD
      ? null
      : r.rows[0].narrator_id;
    matchCache.set(norm, id);
    return id;
  } catch {
    matchCache.set(norm, null);
    return null;
  } finally {
    client.release();
  }
}

function inferDirection(verb: Verb, phrase: string): "subject_is_student" | "subject_is_teacher" {
  if (/^\s*روى\s+عنه/.test(phrase)) return "subject_is_teacher";
  return "subject_is_student";
}

async function main() {
  const entries: RawEntry[] = JSON.parse(readFileSync(FILE, "utf8"));
  log(`Loaded ${entries.length} entries.`);

  // Process entries in parallel chunks. Each entry needs 2 name-matches +
  // 1 insert. With PARALLEL=16 chunks and the Launch plan, throughput
  // should be ~1-2 chunks/sec.
  let matched = 0, inserted = 0, errors = 0;
  let processed = 0;
  for (let i = 0; i < entries.length; i += PARALLEL) {
    const slice = entries.slice(i, i + PARALLEL);
    await Promise.all(
      slice.map(async (e) => {
        try {
          const [sId, oId] = await Promise.all([
            matchOne(e.narrator_name_ar),
            matchOne(e.other_party_name_ar),
          ]);
          if (sId == null || oId == null || sId === oId) return;
          matched++;
          const direction = inferDirection(e.verb, e.phrase_ar);
          const studentId = direction === "subject_is_student" ? sId : oId;
          const teacherId = direction === "subject_is_student" ? oId : sId;
          const r = await pool.query(
            `INSERT INTO attestation_verb (student_id, teacher_id, verb, source_book, phrase_ar)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (student_id, teacher_id, verb, source_book) DO NOTHING`,
            [studentId, teacherId, e.verb, SOURCE_BOOK_KEY, e.phrase_ar.slice(0, 500)],
          );
          if ((r.rowCount ?? 0) > 0) inserted++;
        } catch {
          errors++;
        }
      }),
    );
    processed += slice.length;
    if (processed % 200 === 0 || processed === entries.length) {
      log(
        `  [${processed}/${entries.length}] matched=${matched} inserted=${inserted} errors=${errors} cache=${matchCache.size}`,
      );
    }
  }
  log(`\nDone. matched=${matched} inserted=${inserted} errors=${errors}`);
  await pool.end();
}

main().catch((e) => {
  log("FATAL: " + String(e));
  process.exit(1);
});
