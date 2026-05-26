// Generic Shamela book scraper.
//
// Usage:
//   node scripts/daraqutni/1_scrape.mjs <book_id> <last_page> [out_dir]
//     defaults: book_id=12764 (موسوعة الدارقطني), last_page=4737,
//               out_dir=data/<derived from book id>
//
// Polite throttling: 5 concurrent requests, ~100ms pacing — well under
// what a normal browser does. Pre-existing files are skipped, so the
// script is idempotent across restarts.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

const BOOK_ID = Number(process.argv[2] ?? 12764);
const LAST_PAGE = Number(process.argv[3] ?? 4737);
const OUT_DIR = process.argv[4] ?? `data/shamela_book_${BOOK_ID}`;
const CONCURRENCY = 5;
const POLITE_MS = 100;

async function fetchPage(page) {
  const out = `${OUT_DIR}/page_${page}.html`;
  if (existsSync(out)) return { page, skipped: true };
  const res = await fetch(`https://shamela.ws/book/${BOOK_ID}/${page}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; isnad-app-research/1.0; +https://isnad.online)",
    },
  });
  if (res.status === 404) return { page, missing: true };
  if (!res.ok) return { page, error: `HTTP ${res.status}` };
  const html = await res.text();
  await fs.writeFile(out, html, "utf8");
  return { page, bytes: html.length };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`scraping book ${BOOK_ID}, pages 1..${LAST_PAGE} → ${OUT_DIR}/`);

  let done = 0;
  let skipped = 0;
  let errors = 0;
  const t0 = Date.now();

  const queue = [];
  for (let p = 1; p <= LAST_PAGE; p++) queue.push(p);

  async function worker() {
    while (queue.length > 0) {
      const p = queue.shift();
      if (!p) break;
      try {
        const r = await fetchPage(p);
        if (r.skipped) skipped++;
        else if (r.error) {
          errors++;
          console.error(`page ${p}: ${r.error}`);
        }
      } catch (e) {
        errors++;
        console.error(`page ${p}:`, e.message);
      }
      done++;
      if (done % 50 === 0) {
        const rate = done / ((Date.now() - t0) / 1000);
        console.log(
          `  ${done}/${queue.length + done} (${rate.toFixed(1)}/s, skipped=${skipped}, errors=${errors})`,
        );
      }
      await new Promise((r) => setTimeout(r, POLITE_MS));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(
    `\nDONE: ${done} requested, ${skipped} already-cached, ${errors} errors. ${((Date.now() - t0) / 1000).toFixed(1)}s.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
