// Parse scraped Shamela HTML for «المجروحين من المحدثين» (Ibn Hibban, 354h).
// Each <p> is one paragraph; entries are organized as:
//   <p>NUM - NAME (footnote-ref)</p>
//   <p>VERDICT / biographical prose</p>
//   <p>روى عن ... / حدثنا ... (example narrations to skip)</p>
//   <p>(NUM) footnote (editor's references — skip)</p>
//
// State machine: header paragraph starts a new entry; subsequent verdict
// paragraphs append until we hit an example narration anchor or footnote.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

const IN_DIR = "data/ibn_hibban_majruhin";
const OUT_FILE = "data/ibn_hibban_majruhin/_entries.jsonl";
const LAST_PAGE = 1001;

function arDigitsToAscii(s) {
  return s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

function stripFootnoteRefs(s) {
  return s.replace(/\s*\(\s*[٠-٩\d]+\s*\)\s*/gu, " ").replace(/\s+/g, " ").trim();
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

// "NUM - NAME [ (footnote) ]" header, must be the ENTIRE paragraph.
const HEADER_RX = /^([\d٠-٩]+)\s*-\s*(.+?)(?:\s*\(\s*[٠-٩\d]+\s*\))?\s*$/u;
// Example narration anchor at start of paragraph.
const NARRATION_START_RX = /^(روى\s+(?:عن|عنه)|حدثنا|حدثناه|أخبرنا|أنبأنا|قال\s+حدثنا|قال\s+أخبرنا|أملى\s+علينا|سمعت)\b/u;
// Editor footnote paragraph: starts with "(N)".
const FOOTNOTE_PARA_RX = /^\(\s*[٠-٩\d]+\s*\)/u;

async function parseFile(file) {
  const html = await fs.readFile(file, "utf8");
  const block = htmlBlock(html);
  if (!block) return [];
  const paragraphs = htmlToParagraphs(block);
  const entries = [];
  let cur = null;

  for (const p of paragraphs) {
    const h = p.match(HEADER_RX);
    if (h && h[2].length <= 250) {
      if (cur) entries.push(cur);
      cur = {
        entry_num: parseInt(arDigitsToAscii(h[1]), 10),
        narrator_name: h[2].trim(),
        verdict_ar: "",
        raw_entry: p,
      };
      continue;
    }
    if (!cur) continue;
    // Stop appending if footnote section reached.
    if (FOOTNOTE_PARA_RX.test(p)) {
      entries.push(cur);
      cur = null;
      continue;
    }
    // Stop appending at example narrations — Ibn Hibban's verdict ends
    // where his cited example narrations begin. But "جميعًا موضوعان" /
    // similar editor-style comments AFTER examples are fine to ignore.
    if (NARRATION_START_RX.test(p)) {
      // Mark cur as complete; don't reset (might have multiple narrations,
      // then a closing comment — we already have the verdict).
      cur.verdict_ar = cur.verdict_ar.trim();
      if (cur.verdict_ar.length >= 4) {
        entries.push(cur);
      }
      cur = null;
      continue;
    }
    // Otherwise this is verdict prose — append.
    cur.verdict_ar = (cur.verdict_ar + " " + p).trim();
  }
  if (cur && cur.verdict_ar.length >= 4) entries.push(cur);
  return entries;
}

async function main() {
  const rows = [];
  let pagesRead = 0;
  for (let p = 1; p <= LAST_PAGE; p++) {
    const file = `${IN_DIR}/page_${p}.html`;
    if (!existsSync(file)) continue;
    pagesRead++;
    const entries = await parseFile(file);
    for (const e of entries) {
      e.verdict_ar = stripFootnoteRefs(e.verdict_ar).replace(/[.،\s]+$/u, "").trim();
      if (e.verdict_ar.length < 4) continue;
      if (e.verdict_ar.length > 2000) e.verdict_ar = e.verdict_ar.slice(0, 2000);
      rows.push({ page: p, ...e });
    }
  }
  await fs.writeFile(OUT_FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`pages: ${pagesRead}  entries: ${rows.length}  -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
