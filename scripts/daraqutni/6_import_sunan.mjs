// Parse + import سنن الدارقطني into the hadith corpus.
// Shamela book 9771, 4543 pages, شعيب الأرناؤوط edition.
//
// Each page has multiple hadiths, each preceded by "<NUM> - حدثنا/أخبرنا/قال…".
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import pg from "pg";

const IN_DIR = "data/sunan_daraqutni";
const LAST_PAGE = 4543;
const BOOK_ID = "daraqutni_sunan";
const BOOK_NAME_AR = "سنن الدارقطني";
const BOOK_NAME_EN = "Sunan al-Daraqutni";

const STRIP = /[ؐ-ًؚ-ٰٟـ]/g;
const FOLD = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه" };
function normalize(s) {
  return s.normalize("NFC").replace(STRIP, "").replace(/[أإآٱىة]/g, (c) => FOLD[c] ?? c).replace(/\s+/g, " ").trim();
}

function arDigitsToAscii(s) {
  return s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

function htmlBlock(html) {
  const m = html.match(/<div\s+class="nass[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : null;
}

function htmlToParagraphs(block) {
  return block
    .replace(/<\/p>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

// Hadith header: "NUM - <text starting with حدثنا/أخبرنا/...>"
const HADITH_RX = /^([\d٠-٩]+)\s*-\s*(.+)$/;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Wipe any prior partial import for this book.
  await client.query("DELETE FROM hadith WHERE book_id = $1", [BOOK_ID]);

  let pagesRead = 0;
  let hadithsInserted = 0;
  const seen = new Set();
  const t0 = Date.now();

  for (let p = 1; p <= LAST_PAGE; p++) {
    const file = `${IN_DIR}/page_${p}.html`;
    if (!existsSync(file)) continue;
    pagesRead++;
    const html = await fs.readFile(file, "utf8");
    const block = htmlBlock(html);
    if (!block) continue;
    const paragraphs = htmlToParagraphs(block);
    for (const para of paragraphs) {
      const m = para.match(HADITH_RX);
      if (!m) continue;
      const num = parseInt(arDigitsToAscii(m[1]), 10);
      const text = m[2].trim();
      if (text.length < 20) continue;
      // Dedupe — same num shouldn't appear twice.
      if (seen.has(num)) continue;
      seen.add(num);
      const norm = normalize(text);
      if (norm.length < 10) continue;
      await client.query(
        `INSERT INTO hadith (book_id, book_name_ar, book_name_en, hadith_in_book, arabic_full, arabic_normalized)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [BOOK_ID, BOOK_NAME_AR, BOOK_NAME_EN, num, text, norm],
      );
      hadithsInserted++;
      if (hadithsInserted % 500 === 0) {
        const rate = hadithsInserted / ((Date.now() - t0) / 1000);
        console.log(`  ${hadithsInserted} inserted (${rate.toFixed(1)}/s)`);
      }
    }
  }
  console.log(`\nDONE: pages=${pagesRead}, hadiths inserted=${hadithsInserted}`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
