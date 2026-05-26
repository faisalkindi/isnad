// Parse al-'Ijli's «معرفة الثقات». Each paragraph = one entry of the form:
//   "<NUM> - <NAME> [extra context] <VERDICT> [more notes]"
// We extract the WHOLE entry body after the name+number as the verdict.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

const IN_DIR = "data/ijli_thiqat";
const OUT_FILE = "data/ijli_thiqat/_entries.jsonl";
const LAST_PAGE = 765;

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

// "NUM - NAME [rest]" — name ends at the first jarh/tadil keyword or a long
// comma run. Use a permissive split: take first chunk before "ثقة|ضعيف|..."
const HEADER_RX = /^([\d٠-٩]+)\s*-\s*(.+)$/;
const VERDICT_KEYS = [
  "ثقة", "ثبت", "حافظ", "صدوق", "لا بأس به", "حسن الحديث",
  "ضعيف", "متروك", "ليس بشيء", "ليس بثقة", "مجهول",
  "صحابي", "تابعي", "من كبار التابعين",
  "كذاب", "وضاع", "منكر الحديث", "لين الحديث",
];

async function main() {
  const rows = [];
  let pagesRead = 0;
  for (let p = 1; p <= LAST_PAGE; p++) {
    const file = `${IN_DIR}/page_${p}.html`;
    if (!existsSync(file)) continue;
    pagesRead++;
    const html = await fs.readFile(file, "utf8");
    const block = htmlBlock(html);
    if (!block) continue;
    const paragraphs = htmlToParagraphs(block);
    for (const para of paragraphs) {
      const m = para.match(HEADER_RX);
      if (!m) continue;
      const entryNum = parseInt(arDigitsToAscii(m[1]), 10);
      const rest = m[2].trim();
      // Normalize tashkeel so verdict keyword matching works against
      // diacritized al-'Ijli text ("ثِقَة" matches "ثقة").
      const norm = rest.normalize("NFC").replace(/[ؐ-ًؚ-ٰٟـ]/g, "");
      let nameEnd = norm.length;
      for (const k of VERDICT_KEYS) {
        const i = norm.indexOf(k);
        if (i !== -1 && i < nameEnd) nameEnd = i;
      }
      // Map back to original text. Since we only stripped chars (no
      // additions), and stripping shifts positions, we just count
      // non-stripped chars in `rest` up to nameEnd.
      const STRIP_RX = /[ؐ-ًؚ-ٰٟـ]/;
      let origIdx = 0;
      let normIdx = 0;
      while (normIdx < nameEnd && origIdx < rest.length) {
        if (!STRIP_RX.test(rest[origIdx])) normIdx++;
        origIdx++;
      }
      const name = rest.slice(0, origIdx).replace(/[،.\s]+$/u, "").trim();
      const verdict = rest.slice(origIdx).replace(/^[،.\s]+/u, "").replace(/[،.\s]+$/u, "").trim();
      if (name.length < 2 || name.length > 250) continue;
      // Some entries truly have no verdict (just "تابعي" or just biographical
      // context) — keep them anyway with verdict = "ذكره العجلي في كتابه"
      // because inclusion in al-'Ijli's «معرفة الثقات» itself implies تعديل.
      const finalVerdict = verdict.length >= 2 ? verdict : "ذكره العجلي في معرفة الثقات";
      rows.push({ page: p, entry_num: entryNum, narrator_name: name, verdict_ar: finalVerdict, raw_entry: para });
    }
  }
  await fs.writeFile(OUT_FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`pages: ${pagesRead}  entries: ${rows.length}  -> ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
