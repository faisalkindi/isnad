// Imports Itqan's Sunni hadith corpus into Postgres. Idempotent.
// Run: npx tsx scripts/import-itqan-hadiths.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { normalizeArabic } from "../src/lib/normalize";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});
const DATA = join(process.cwd(), "data", "itqan-hadiths");
const MAX_PARAMS = 60000;

interface Book {
  id: string;
  name_ar: string;
  name_en: string;
}
interface ChapterEntry {
  file: string;
  name_ar: string;
  count: number;
}
interface ItqanHadith {
  id: number;
  idInBook: number;
  arabic: string;
  english?: { narrator?: string; text?: string };
  grade?: string;
}

const HADITH_COLS = [
  "book_id", "book_name_ar", "book_name_en", "hadith_in_book",
  "chapter_no", "chapter_name_ar", "arabic_full", "arabic_normalized",
  "english_text", "english_narrator", "grade",
];

async function insertBatched(rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const cols = HADITH_COLS.length;
  const batchSize = Math.floor(MAX_PARAMS / cols);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row, r) => {
      const placeholders = HADITH_COLS.map((_, c) => `$${r * cols + c + 1}`);
      values.push(...row);
      return `(${placeholders.join(",")})`;
    });
    await pool.query(
      `INSERT INTO hadith (${HADITH_COLS.join(",")}) VALUES ${tuples.join(",")}`,
      values,
    );
  }
}

async function importBook(book: Book): Promise<number> {
  const bookDir = join(DATA, book.id);
  const indexPath = join(bookDir, "index.json");
  const chapters = JSON.parse(readFileSync(indexPath, "utf8")) as ChapterEntry[];

  const rows: unknown[][] = [];
  let chapterNo = 0;
  for (const ch of chapters) {
    chapterNo++;
    const file = join(bookDir, ch.file);
    const hadiths = JSON.parse(readFileSync(file, "utf8")) as ItqanHadith[];
    for (const h of hadiths) {
      const arabic_full = h.arabic ?? "";
      rows.push([
        book.id,
        book.name_ar,
        book.name_en,
        h.idInBook ?? null,
        chapterNo,
        ch.name_ar,
        arabic_full,
        normalizeArabic(arabic_full),
        h.english?.text ?? null,
        h.english?.narrator ?? null,
        h.grade ?? null,
      ]);
    }
  }
  await insertBatched(rows);
  return rows.length;
}

async function importAll() {
  console.log("Truncating hadith table ...");
  await pool.query("TRUNCATE hadith RESTART IDENTITY");

  const booksJson = JSON.parse(
    readFileSync(join(DATA, "books.json"), "utf8"),
  ) as {
    sunni: { the_9_books: Book[]; forties: Book[]; other_books: Book[] };
  };
  const all = [
    ...booksJson.sunni.the_9_books,
    ...booksJson.sunni.forties,
    ...booksJson.sunni.other_books,
  ];

  let grand = 0;
  for (const b of all) {
    if (!readdirSync(DATA).includes(b.id)) {
      console.log(`  ${b.id} — directory missing, skipped`);
      continue;
    }
    const n = await importBook(b);
    console.log(`  ${b.id.padEnd(28)} ${n.toLocaleString()} hadiths`);
    grand += n;
  }

  const count = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM hadith",
  );
  console.log(`\nhadith count: ${count.rows[0].n.toLocaleString()}`);

  const size = await pool.query<{ size: string }>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
  );
  console.log(`database size: ${size.rows[0].size}`);
}

importAll()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
