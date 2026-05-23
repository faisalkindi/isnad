// Downloads Itqan's full Sunni hadith corpus (~112K hadiths across 18 books).
// Per book: index.json (chapter list) + grades.json (optional) + per-chapter
// hadith files. Run: npx tsx scripts/download-itqan-hadiths.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://r3genesi5.github.io/Itqan/app/data/";
const OUT = join(process.cwd(), "data", "itqan-hadiths");

interface Book {
  id: string;
  name_ar: string;
  name_en: string;
  author: string;
  died: number | null;
  graded: boolean;
}
interface ChapterEntry {
  file: string;
  name_ar: string;
  name_en?: string;
  count: number;
}

async function fetchText(path: string): Promise<string> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
}

async function downloadBook(book: Book): Promise<number> {
  const dir = join(OUT, book.id);
  mkdirSync(dir, { recursive: true });

  const indexText = await fetchText(`sunni/${book.id}/index.json`);
  writeFileSync(join(dir, "index.json"), indexText);
  const index = JSON.parse(indexText) as ChapterEntry[];

  try {
    const gradesText = await fetchText(`sunni/${book.id}/grades.json`);
    writeFileSync(join(dir, "grades.json"), gradesText);
  } catch {
    // grades.json is optional — some books don't have it
  }

  let total = 0;
  for (const ch of index) {
    const chapterText = await fetchText(`sunni/${book.id}/${ch.file}`);
    writeFileSync(join(dir, ch.file), chapterText);
    total += ch.count;
  }
  return total;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const booksText = await fetchText("books.json");
  writeFileSync(join(OUT, "books.json"), booksText);
  const books = JSON.parse(booksText) as {
    sunni: { the_9_books: Book[]; forties: Book[]; other_books: Book[] };
  };
  const all = [
    ...books.sunni.the_9_books,
    ...books.sunni.forties,
    ...books.sunni.other_books,
  ];

  let grand = 0;
  for (const b of all) {
    const n = await downloadBook(b);
    console.log(`  ${b.id.padEnd(28)} ${n.toLocaleString()} hadiths`);
    grand += n;
  }
  console.log(`\nTotal: ${grand.toLocaleString()} hadiths across ${all.length} Sunni books.`);
}

main().catch((e) => {
  console.error("Download failed:", e);
  process.exit(1);
});
