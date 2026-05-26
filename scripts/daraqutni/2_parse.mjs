// Parse scraped Shamela HTML for موسوعة الدارقطني into structured entries.
//
// Real-world forms we handle (verified against samples):
//   ENTRY HEADERS: "<NUM> - <NAME>." on its own line at top of page
//   VERDICTS, each bullet (•) is one verdict, varieties:
//     1. "قال الدَّارَقُطْنِيّ: <verdict>. (page)"          direct citation
//     2. "قال <X>: قال الدَّارَقُطْنِيّ: <verdict>. (page)"  relayed via student X
//     3. "وقال الدَّارَقُطْنِيّ: <verdict>"                  continuation
//     4. "قال <X>: وقال الدَّارَقُطْنِيّ: <verdict>"          relayed continuation
//     5. "قال <X>: قال أبو الحسن الدَّارَقُطْنِيّ: <verdict>" full kunya
//     6. "وذكر الدَّارَقُطْنِيّ في «<book>»: <verdict>"       cross-cited
//
//   CONTINUATION PAGES: some entries span 2+ Shamela pages; pages without a
//   header inherit the previous page's narrator. We carry the last seen
//   header forward.
//
// Output: one JSONL row per (narrator, verdict). One narrator may yield
// multiple rows when several verdicts apply.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

const IN_DIR = "data/daraqutni_mawsuah";
const OUT_FILE = "data/daraqutni_mawsuah/_entries.jsonl";
const LAST_PAGE = 4737;

function arDigitsToAscii(s) {
  return s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

/** Extract paragraphs from the nass HTML block, preserving bullet markers. */
function htmlToText(block) {
  return block
    .replace(/<\/p>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

const HEADER_RX = /^([\d٠-٩]+)\s*-\s*(.+?)\s*\.\s*$/;

// Match "قال الدارقطني:" — also "وقال", "قال أبو الحسن"... — TASHKEEL TOLERANT.
// Build the الدارقطني matcher allowing optional diacritics on every letter.
const DARAQ = "ال[دذ][َّ ]*ا?رَ?ا?قُ?ط[ْ]?نِ?ي[ّ]?";
const SPEAK_VERB = "(?:قال|وقال|قال\\s+لي|سئل|وذكر|قال\\s+لنا)";
// Anchor: speaking verb + optional "أبو الحسن" + الدارقطني + colon/comma
const DARAQ_ANCHOR_RX = new RegExp(
  `(${SPEAK_VERB})\\s+(?:(?:أبو|أبي)\\s+الحسن\\s+)?${DARAQ}\\s*(?::|في\\s+«[^»]+»\\s*:)`,
  "gu",
);
// Optional relayer preceding the anchor: "قال X: قال الدارقطني..."
// Captured by looking at text before the anchor.

const PAGE_REF_RX = /\(([٠-٩\d]+)\)/u;

/** Find each Daraqutni-attributed verdict in one bullet segment. */
function extractVerdictsFromSegment(seg) {
  const verdicts = [];
  for (const match of seg.matchAll(DARAQ_ANCHOR_RX)) {
    const anchorStart = match.index;
    const anchorEnd = anchorStart + match[0].length;

    // Look back to find a relayer ("قال X:") immediately preceding.
    const before = seg.slice(0, anchorStart);
    const relayMatch = before.match(/قال\s+([^:]{1,40})\s*:\s*$/u);
    const relayedVia = relayMatch ? relayMatch[1].trim() : null;

    // Verdict text runs from after the colon to the next bullet or end.
    let verdictText = seg.slice(anchorEnd).trim();
    // If a NEW anchor appears further on, stop before it.
    const nextAnchor = verdictText.search(DARAQ_ANCHOR_RX);
    if (nextAnchor !== -1) verdictText = verdictText.slice(0, nextAnchor).trim();

    // Extract optional page reference like (٤٥)
    const refMatch = verdictText.match(PAGE_REF_RX);
    const pageRef = refMatch ? arDigitsToAscii(refMatch[1]) : null;
    if (refMatch) {
      verdictText = verdictText.replace(refMatch[0], "").trim();
    }
    // Trim trailing period / parens / whitespace.
    verdictText = verdictText.replace(/[.،\s]+$/u, "").trim();

    if (verdictText.length > 0 && verdictText.length < 1200) {
      verdicts.push({
        relayed_via: relayedVia,
        verdict_ar: verdictText,
        page_ref: pageRef,
        raw_entry: seg.slice(0, 600),
      });
    }
  }
  return verdicts;
}

async function main() {
  const startArg = Number(process.argv[2] ?? 1);
  const endArg = Number(process.argv[3] ?? LAST_PAGE);

  let pagesRead = 0;
  let entriesParsed = 0;
  let verdictsExtracted = 0;
  let continuationVerdicts = 0;
  const rows = [];

  // Carry-forward narrator state across pages for continuation pages.
  let currentEntryNum = null;
  let currentNarrator = null;
  let currentPageStart = null;

  for (let p = startArg; p <= endArg; p++) {
    const file = `${IN_DIR}/page_${p}.html`;
    if (!existsSync(file)) continue;
    pagesRead++;
    const html = await fs.readFile(file, "utf8");
    const nass = html.match(/<div\s+class="nass[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!nass) continue;
    const paragraphs = htmlToText(nass[1]);
    if (paragraphs.length === 0) continue;

    // Detect header on first paragraph.
    const headerMatch = paragraphs[0].match(HEADER_RX);
    let bodyParas;
    if (headerMatch) {
      currentEntryNum = parseInt(arDigitsToAscii(headerMatch[1]), 10);
      currentNarrator = headerMatch[2].trim();
      currentPageStart = p;
      entriesParsed++;
      bodyParas = paragraphs.slice(1);
    } else {
      // Continuation page — keep last seen narrator. If we never saw a
      // header yet, skip (we're before the rijal section).
      if (currentNarrator === null) continue;
      bodyParas = paragraphs;
    }

    // Each paragraph may contain one or more bullets.
    for (const para of bodyParas) {
      // Split on • but keep what comes after each.
      const segments = para.split(/(?=•)/).map((s) => s.trim()).filter((s) => s.length > 0);
      for (const seg of segments) {
        const found = extractVerdictsFromSegment(seg);
        for (const v of found) {
          verdictsExtracted++;
          if (!headerMatch) continuationVerdicts++;
          rows.push({
            page: p,
            entry_page_start: currentPageStart,
            entry_num: currentEntryNum,
            narrator_name: currentNarrator,
            ...v,
          });
        }
      }
    }
  }

  await fs.writeFile(
    OUT_FILE,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );
  console.log(
    `pages read:    ${pagesRead}\n` +
      `entry headers: ${entriesParsed}\n` +
      `verdicts:      ${verdictsExtracted} (${continuationVerdicts} on continuation pages)\n` +
      `→ ${OUT_FILE}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
