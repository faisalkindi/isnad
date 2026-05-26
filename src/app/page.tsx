"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChainVerdict,
  HadithMatch,
  MatchResult,
  NisbahResult,
  NisbahType,
  TadlisSummary,
  NumberClassification,
  NumberClass,
  SaqtClassification,
  RankClassification,
  AcceptanceClassification,
  TanReason,
} from "@/lib/match/matcher";
// Import TAN_LABELS direct from classify.ts (pure, no DB deps) — going via
// matcher.ts would drag `pg` into the client bundle.
import { TAN_LABELS } from "@/lib/match/classify";
import { IsnadDiagram } from "@/components/IsnadDiagram";
import { shortName, primaryDeathYear } from "@/lib/names";
import { sourceBookAr } from "@/lib/sources";
import { lookupJarhTerm } from "@/lib/jarh-terms";

const EXAMPLE =
  "حدثنا الحميدي عبد الله بن الزبير، قال: حدثنا سفيان، قال: حدثنا يحيى بن سعيد الأنصاري، قال: أخبرني محمد بن إبراهيم التيمي، أنه سمع علقمة بن وقاص الليثي، يقول: سمعت عمر بن الخطاب رضي الله عنه على المنبر، قال: سمعت رسول الله صلى الله عليه وسلم يقول: إنما الأعمال بالنيات وإنما لكل امرئ ما نوى";

const X_LIMIT = 280; // X (Twitter) free-tier post limit, verified 2026-05.

/** Build the per-tier-A checklist that mirrors the classical five conditions
 *  of ḥadīth ṣaḥīḥ per Ibn al-Ṣalāḥ: (1) ittiṣāl al-sanad, (2) ʿadāla,
 *  (3) ḍabṭ, (4) عدم الشذوذ, (5) عدم العلّة. We group (2) and (3) onto one
 *  line and add a tadlīs-absolution note when applicable. */
function buildTierAChecklist(result: MatchResult): { ok: boolean; text: string }[] {
  const items: { ok: boolean; text: string }[] = [];

  // 1. Ittiṣāl al-sanad — connection.
  const broken = result.chain_verdict === "broken";
  items.push({
    ok: !broken,
    text: broken
      ? "لم يتحقّق اتصال السند — يوجد انقطاع في السلسلة."
      : "اتصال السند بسماع كل راوٍ ممَّن فوقه.",
  });

  // 2-3. ʿAdāla + ḍabṭ — at the chain level, all narrators must be reliable+.
  const ranks = result.narrators
    .filter((n) => n.narrator && !n.is_source)
    .map((n) => n.narrator?.harshest_grade_en ?? n.narrator?.grade_en ?? "unknown");
  const hasWeak = ranks.some((r) =>
    ["weak", "abandoned", "fabricator", "matruk", "majhul"].includes(r),
  );
  const allReliable = ranks.length > 0 && ranks.every((r) =>
    ["reliable", "mostly_reliable", "companion", "prophet"].includes(r),
  );
  items.push({
    ok: !hasWeak,
    text: hasWeak
      ? "لم تتحقّق العدالة والضبط — في الإسناد راوٍ ضعيف."
      : allReliable
        ? "عدالة وضبط جميع رواته (كلَّهم ثقات)."
        : "عدالة الرواة محقَّقة، وضبطهم تامّ أو حسن.",
  });

  // 4. Tadlīs absolution (only render when relevant — chain has a mudallis).
  const tadlisRisk = result.tadlis?.hasIsnad || result.tadlis?.hasTaswiya;
  if (tadlisRisk) {
    // Was the samaa explicitly proven via attestation_verb for that link?
    const samaaProven = result.links.some(
      (l) => l.attestation_verb?.verb === "samaa",
    );
    items.push({
      ok: samaaProven,
      text: samaaProven
        ? "تصريح المدلِّس بالسماع في «التاريخ الكبير» فينتفي ضرر تدليسه."
        : "في الإسناد مدلِّس عَنْعَن دون تصريح بالسماع — وقفٌ في القبول.",
    });
  }

  // 5. Shudhūdh + ʿilla — we can't auto-detect; we honestly note it.
  items.push({
    ok: true,
    text: "خلوّ السلسلة من الشذوذ والعلَّة القادحة (بحسب ما اطّلعنا عليه — التحقّق النهائي للمتخصِّص).",
  });

  return items;
}

/** Plain-Arabic note for the «شهرة» (popularity) row in Tier B. Derived from
 *  corpus_matches count — not a classical-term mapping, just an honest gloss. */
function shuhraText(result: MatchResult): string {
  const n = result.corpus_matches.length;
  if (n === 0) return "لم نعثر على مواضع للمتن في الكتب الأصول المُستوردة.";
  if (n >= 10) return `مشهور من جهة العمل والتلقّي بالقبول — ${n} مواضع في كتب الحديث.`;
  if (n >= 3) return `معروف في الكتب الأصول — ${n} مواضع.`;
  return `وردَ في ${n} موضع${n === 1 ? "" : "ين"} فقط من الكتب المُستوردة.`;
}

const FOOTER = "— تدقيقٌ آليّ على ٢٢ كتاب رجال + ١٨ كتاب حديث.";

const WEAK_HARSHEST = new Set([
  "weak",
  "abandoned",
  "fabricator",
  "matruk",
  "majhul",
]);

function verdictLabelAr(v: ChainVerdict): string {
  if (v === "sahih_candidate") return "ظاهره الصحة";
  if (v === "hasan_candidate") return "ظاهره الحسن";
  if (v === "daif") return "ضعيف";
  if (v === "broken") return "منقطع";
  return "يحتاج مراجعة";
}

/** For ḍaʿīf chains: find the weakest narrator (lowest tier per the matcher's
 *  "always-harshest" policy). Returns null when no weak narrator is present
 *  (e.g., a broken-but-otherwise-clean chain). */
function findWeakestNarrator(result: MatchResult) {
  for (const branch of result.branches) {
    for (const n of branch.narrators) {
      if (n.narrator && WEAK_HARSHEST.has(n.narrator.harshest_grade_en ?? "")) {
        return n;
      }
    }
  }
  return null;
}

/** Build the WHY line for a ḍaʿīf verdict: name the weak narrator, the
 *  harshest jarh against him verbatim, the critic who said it, and the
 *  book it's in. This is the most-asked-for piece of any hadith verdict. */
function explainDaif(result: MatchResult): string | null {
  const weak = findWeakestNarrator(result);
  if (!weak?.narrator) return null;
  const n = weak.narrator;
  const name = shortName(n.full_name);
  const death = primaryDeathYear(n.death);
  const deathTag = death ? ` (ت ${death.year})` : "";
  const phrase = (n.harshest_grade_ar ?? "").trim();
  const bookKey = n.harshest_source_book;
  const bookAr = bookKey ? sourceBookAr(bookKey) : null;
  // Try to locate the source_verdict whose text matches the harshest grade —
  // gives us the actual critic's name (الدارقطني / ابن حبان / ابن معين …).
  const sv = n.source_verdicts.find(
    (v) =>
      (bookKey == null || v.source_book === bookKey) &&
      phrase.length > 0 &&
      (v.verdict_ar.trim() === phrase || v.verdict_ar.includes(phrase)),
  );
  const critic = sv?.author_ar ?? null;
  // Decode the classical jarh phrase into a plain-Arabic gloss the reader
  // doesn't need to be a hadith specialist to understand.
  const glossText = glossForJarhPhrase(phrase, critic);
  const gloss = glossText ? ` — أي ${glossText}` : "";
  if (critic && bookAr && phrase) {
    return `العلّة: ${name}${deathTag} — قال ${critic} في «${bookAr}»: «${phrase}»${gloss}.`;
  }
  if (bookAr && phrase) {
    return `العلّة: ${name}${deathTag} — في «${bookAr}»: «${phrase}»${gloss}.`;
  }
  if (phrase) {
    return `العلّة: ${name}${deathTag} — «${phrase}»${gloss}.`;
  }
  return `العلّة: ${name}${deathTag}.`;
}

/** Look up a classical jarh phrase and return a short plain-Arabic
 *  explanation. Drops the leading bracketing phrasing to flow inline. */
function glossForJarhPhrase(phrase: string, critic: string | null): string | null {
  const term = lookupJarhTerm(phrase);
  if (!term) return null;
  // Ibn Maʿīn used some phrases with a softer meaning; surface the caveat
  // only when his name is the named critic.
  const isIbnMaeen = critic != null && /ابن\s*مَ?عين|يحيى\s*بن\s*مَ?عين/.test(critic);
  const base = term.explanation.trim().replace(/\.$/, "");
  if (isIbnMaeen && term.caveat) {
    // The caveat already includes "تنبه إذا كان القائل ابن معين" — keep short.
    return `${base} (لكنّ ابن معين قد يقصد به: أحاديثه قليلة)`;
  }
  return base;
}

/** Build a "supporting evidence" line for sahih/hasan chains: cite the
 *  strongest verb-attestation we have for any link (e.g., samaa in al-Tarikh
 *  al-Kabir, or attested in Tahdhib al-Kamal). Returns null if no evidence
 *  beyond chronology is available. */
function evidenceLine(result: MatchResult): string | null {
  const allLinks = result.branches.flatMap((b) => b.links);
  // Prefer samaa (strongest); otherwise any verb evidence.
  const samaaLink = allLinks.find((l) => l.attestation_verb?.verb === "samaa");
  if (samaaLink?.attestation_verb) {
    return `الدليل: «${samaaLink.attestation_verb.phrase_ar ?? "ثبت السماع"}» — في «التاريخ الكبير للبخاري».`;
  }
  // Otherwise note source-book attestation if rich.
  const richSrcLink = allLinks.find(
    (l) => l.source_books && l.source_books.length >= 2,
  );
  if (richSrcLink?.source_books) {
    return `الدليل: الإسناد موثَّق في كتب الرجال الكلاسيكية (${richSrcLink.source_books.length} كتاب).`;
  }
  return null;
}

/** Build the WHY line for a broken chain: prefer a documented non-meeting
 *  citation (al-Marāsīl) over chronology; fall back to chronology. */
function explainBroken(result: MatchResult): string | null {
  // Highest priority: documented non-meeting from al-Marāsīl etc.
  for (const branch of result.branches) {
    const docNoMeet = branch.links.find((l) => l.documented_non_meeting);
    if (docNoMeet?.documented_non_meeting) {
      const student = branch.narrators.find((n) => n.position === docNoMeet.from_position);
      const teacher = branch.narrators.find((n) => n.position === docNoMeet.to_position);
      const studentName = student?.narrator ? shortName(student.narrator.full_name) : student?.fragment ?? "؟";
      const teacherName = teacher?.narrator ? shortName(teacher.narrator.full_name) : teacher?.fragment ?? "؟";
      return `الانقطاع: ${studentName} ← ${teacherName} — «${docNoMeet.documented_non_meeting.phrase_ar}» (من «المراسيل لابن أبي حاتم»).`;
    }
  }
  for (const branch of result.branches) {
    const bad = branch.links.find((l) => l.status === "impossible");
    if (!bad) continue;
    const student = branch.narrators.find((n) => n.position === bad.from_position);
    const teacher = branch.narrators.find((n) => n.position === bad.to_position);
    const studentName = student?.narrator
      ? shortName(student.narrator.full_name)
      : student?.fragment ?? "؟";
    const teacherName = teacher?.narrator
      ? shortName(teacher.narrator.full_name)
      : teacher?.fragment ?? "؟";
    return `الانقطاع: ${studentName} ← ${teacherName} — ${bad.reason}`;
  }
  return null;
}

/** Build a tight Arabic summary of the verdict suitable for a single X post.
 *  Greedy: appends sections in priority order, stops/truncates so the result
 *  fits in X_LIMIT characters. URLs are not embedded — the user can add their
 *  own (every t.co URL counts as 23 chars regardless of length).
 *
 *  Priority (high → low): headline, meta, EXPLANATION (why), saqṭ note, tadlīs
 *  warning, multi-branch note, corpus matches, footer. The explanation is
 *  considered essential for any non-sahih verdict and is preserved before
 *  corpus matches if the budget gets tight. */
function buildShareText(result: MatchResult): string {
  const headline = result.rank
    ? `📜 الحُكْم: ${result.rank.label}${result.acceptance ? ` · ${result.acceptance.label}` : ""}`
    : `📜 ${verdictLabelAr(result.chain_verdict)}`;

  const metaBits: string[] = [];
  if (result.nisbah?.label && result.nisbah.type !== "unknown") metaBits.push(result.nisbah.label);
  if (result.number?.label) metaBits.push(`${result.number.label} في كتبنا`);
  const meta = metaBits.join(" · ");

  // For ضعيف and منقطع we surface the WHY (which narrator / which broken link).
  // For ظاهره الصحة / الحسن we surface the EVIDENCE (samaa attestation, source books).
  const explanation =
    result.chain_verdict === "daif"
      ? explainDaif(result)
      : result.chain_verdict === "broken"
        ? explainBroken(result)
        : result.chain_verdict === "sahih_candidate" || result.chain_verdict === "hasan_candidate"
          ? evidenceLine(result)
          : null;

  const saqt =
    result.saqt && result.saqt.type !== "none"
      ? `نوع الانقطاع: ${result.saqt.label}`
      : null;

  const tadlis = result.tadlis?.hasTaswiya
    ? "⚠ يُحتمَل تدليس التسوية في الإسناد."
    : result.tadlis?.hasIsnad
      ? "⚠ يُحتمَل تدليس الإسناد (راوٍ مدلِّس عَنْعَن)."
      : null;

  const branchNote = result.has_multiple_branches
    ? `📚 ${result.branches.length} طُرُق (اعتبار).`
    : null;

  // Required (in order): headline, meta, explanation, footer. Everything
  // else competes for the remaining budget.
  const required = [headline, meta, explanation, FOOTER].filter(Boolean) as string[];
  let text = required.join("\n");

  // If the required block alone overflows, truncate the explanation's quote.
  if (text.length > X_LIMIT && explanation) {
    const truncated = truncateExplanation(explanation, X_LIMIT - (text.length - explanation.length));
    text = [headline, meta, truncated, FOOTER].filter(Boolean).join("\n");
  }

  // Optional, in priority order.
  const optionals: string[] = [];
  if (saqt) optionals.push(saqt);
  if (tadlis) optionals.push(tadlis);
  if (branchNote) optionals.push(branchNote);

  for (const opt of optionals) {
    const candidate = insertBeforeFooter(text, opt);
    if (candidate.length <= X_LIMIT) text = candidate;
  }

  // Corpus matches: greedy-fit as many as possible.
  if (result.corpus_matches.length > 0) {
    const cites = result.corpus_matches
      .slice(0, 5)
      .map((m) =>
        m.hadith_in_book != null
          ? `${m.book_name_ar} (${m.hadith_in_book})`
          : m.book_name_ar,
      );
    for (let n = cites.length; n >= 1; n--) {
      const line = `أخرجه: ${cites.slice(0, n).join("، ")}`;
      const candidate = insertBeforeFooter(text, line);
      if (candidate.length <= X_LIMIT) {
        text = candidate;
        break;
      }
    }
  }

  if (text.length > X_LIMIT) text = text.slice(0, X_LIMIT - 1) + "…";
  return text;
}

function insertBeforeFooter(text: string, line: string): string {
  const lines = text.split("\n");
  lines.splice(lines.length - 1, 0, line);
  return lines.join("\n");
}

function truncateExplanation(explanation: string, maxLen: number): string {
  if (explanation.length <= maxLen) return explanation;
  // Try shrinking the «verbatim quote» first.
  const quoteMatch = explanation.match(/«([^»]+)»/);
  if (quoteMatch) {
    const quote = quoteMatch[1];
    const overshoot = explanation.length - maxLen;
    const newQuoteLen = Math.max(8, quote.length - overshoot - 1);
    if (newQuoteLen < quote.length) {
      const shortenedQuote = quote.slice(0, newQuoteLen).trimEnd() + "…";
      return explanation.replace(`«${quote}»`, `«${shortenedQuote}»`);
    }
  }
  return explanation.slice(0, maxLen - 1) + "…";
}

function ShareBox({ result }: { result: MatchResult }) {
  const text = useMemo(() => buildShareText(result), [result]);
  const [copied, setCopied] = useState(false);
  const remaining = X_LIMIT - text.length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: leave the textarea so the user can manually select/copy.
    }
  };
  const xIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  return (
    <section className="card share-card">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">للنشر</div>
          <h2 className="section-title">نسخةٌ جاهزة للنشر على X</h2>
        </div>
        <span
          className="share-counter"
          style={{
            color: remaining < 0 ? "var(--red-500, oklch(0.55 0.18 30))" : "var(--ink-3)",
          }}
        >
          {text.length} / {X_LIMIT}
        </span>
      </div>
      <textarea
        className="share-textarea"
        readOnly
        value={text}
        rows={Math.min(10, text.split("\n").length + 1)}
        dir="rtl"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="share-actions">
        <button type="button" className="primary-btn" onClick={copy}>
          {copied ? "✓ نُسِخ" : "نسخ النص"}
        </button>
        <a
          className="share-x-btn"
          href={xIntent}
          target="_blank"
          rel="noopener noreferrer"
        >
          نشر على X ↗
        </a>
      </div>
    </section>
  );
}

/** Visual tag for the «نسبته إلى قائله» classification. Color-coded so
 *  marfūʿ (Prophet) is most prominent, qudsī gets a special amber, and
 *  mawqūf/maqṭūʿ are muted to match their classical secondary status. */
const NISBAH_STYLE: Record<
  NisbahType,
  { className: string; symbol: string }
> = {
  marfu_sarih: {
    className: "bg-blue-100 text-blue-900 border-blue-300",
    symbol: "ﷺ",
  },
  marfu_hukman: {
    className: "bg-sky-100 text-sky-900 border-sky-300",
    symbol: "ﷺ",
  },
  qudsi: {
    className: "bg-amber-100 text-amber-900 border-amber-300",
    symbol: "✦",
  },
  mawquf: {
    className: "bg-purple-100 text-purple-900 border-purple-300",
    symbol: "◐",
  },
  maqtu: {
    className: "bg-gray-100 text-gray-900 border-gray-300",
    symbol: "○",
  },
  unknown: {
    className: "bg-gray-50 text-gray-700 border-gray-200",
    symbol: "؟",
  },
};

/** Color-coded number-class badge (متواتر/مشهور/عزيز/غريب). متواتر is awarded
 *  only when per-طبقة alignment confirms ≥10 distinct narrators at the
 *  narrowest level — Ibn Ḥajar's classical condition. */
const NUMBER_STYLE: Record<NumberClass, string> = {
  mutawatir: "bg-indigo-100 text-indigo-900 border-indigo-300",
  mashhur: "bg-blue-100 text-blue-900 border-blue-300",
  aziz: "bg-cyan-100 text-cyan-900 border-cyan-300",
  gharib_mutlaq: "bg-amber-100 text-amber-900 border-amber-300",
  gharib_nisbi: "bg-yellow-100 text-yellow-900 border-yellow-300",
  unknown: "bg-gray-100 text-gray-700 border-gray-300",
};

/** Map rank/acceptance/number/etc. tier → prototype's .pill-* color class. */
function pillToneFor(kind: "rank" | "acceptance" | "number" | "saqt", type: string): string {
  if (kind === "rank") {
    if (type === "sahih_li_dhatih" || type === "sahih_li_ghayrih") return "pill-strong";
    if (type === "hasan_li_dhatih" || type === "hasan_li_ghayrih") return "pill-good";
    if (type === "daif") return "pill-weak";
    if (type === "broken") return "pill-rejected";
    return "pill-neutral";
  }
  if (kind === "acceptance") {
    if (type === "maqbul") return "pill-strong";
    if (type === "mardud") return "pill-rejected";
    return "pill-neutral";
  }
  if (kind === "number") {
    if (type === "mutawatir") return "pill-strong";
    if (type === "mashhur") return "pill-good";
    if (type === "aziz") return "pill-good";
    if (type === "gharib_mutlaq" || type === "gharib_nisbi") return "pill-weak";
    return "pill-neutral";
  }
  if (kind === "saqt") {
    if (type === "none") return "pill-neutral";
    return "pill-rejected";
  }
  return "pill-neutral";
}

function NumberBadge({ number }: { number: NumberClassification }) {
  const tone = pillToneFor("number", number.type);
  return (
    <span className={`pill pill-md ${tone}`} title={number.reason + "  ·  (في كتبنا)"}>
      <span className="pill-dot" aria-hidden="true" />
      {number.label}
      <span style={{ fontSize: 11, opacity: 0.7, marginInlineStart: 4 }}>في كتبنا</span>
    </span>
  );
}

function AcceptanceBadge({ acceptance }: { acceptance: AcceptanceClassification }) {
  const tone = pillToneFor("acceptance", acceptance.type);
  return (
    <span className={`pill pill-md ${tone}`} title={acceptance.reason}>
      <span className="pill-dot" aria-hidden="true" />
      {acceptance.label}
    </span>
  );
}

function RankBadge({ rank }: { rank: RankClassification }) {
  const tone = pillToneFor("rank", rank.type);
  return (
    <span className={`pill pill-xl ${tone}`} title={rank.reason}>
      <span className="pill-dot" aria-hidden="true" />
      {rank.label}
    </span>
  );
}

function SaqtBadge({ saqt }: { saqt: SaqtClassification }) {
  if (saqt.type === "none") return null;
  return (
    <span className="pill pill-md pill-rejected" title={saqt.reason}>
      <span className="pill-dot" aria-hidden="true" />
      نوع الانقطاع: {saqt.label}
    </span>
  );
}

/** Determine whether a narrator's effective grade is قادح (disqualifying) per
 *  classical usage: weak/abandoned/fabricator → قادح; reliable/mostly_reliable
 *  → غير قادح (note worthy but not chain-breaking). Mirrors `effectiveGrade`. */
function isQadih(gradeEn: string | null): boolean {
  if (!gradeEn) return false;
  return ["weak", "abandoned", "fabricator", "matruk", "majhul"].includes(gradeEn);
}

type TanRowNarrator = {
  position: number;
  fragment: string;
  narrator: {
    full_name: string;
    harshest_grade_en: string | null;
    source_verdicts: { author_ar: string; verdict_ar: string; source_book: string }[];
  } | null;
};

function TanPanel({
  narrators,
  tan,
}: {
  narrators: TanRowNarrator[];
  tan: { position: number; reasons: TanReason[] }[];
}) {
  if (tan.length === 0) return null;
  const anyQadih = tan.some((t) => {
    const n = narrators.find((x) => x.position === t.position);
    return isQadih(n?.narrator?.harshest_grade_en ?? null);
  });
  const summary = anyQadih
    ? "أُحصِيَ على بعض رواة هذا الإسناد جرحٌ قادح — انظر العمود الأخير."
    : "أُحصِي على رواة هذا الإسناد كلامٌ يسير، لم يقدح في الإسناد جملةً.";
  return (
    <>
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "0 0 8px" }}>{summary}</p>
      <div className="taan-table">
        <div className="taan-row taan-head">
          <div>الراوي</div>
          <div>الطاعن</div>
          <div>سبب الطعن</div>
          <div>الحكم</div>
        </div>
        {tan.map((t, i) => {
          const n = narrators.find((x) => x.position === t.position);
          const name = n?.narrator?.full_name?.slice(0, 60) ?? n?.fragment ?? "?";
          const critics = Array.from(
            new Set((n?.narrator?.source_verdicts ?? []).map((v) => v.author_ar).filter(Boolean)),
          ).slice(0, 3);
          const criticsText = critics.length > 0 ? critics.join("، ") : "—";
          const reasonsText = t.reasons
            .map((r) => {
              const lbl = TAN_LABELS[r];
              const cat = lbl.cat === "adala" ? "في العدالة" : "في الضبط";
              return `${lbl.ar} (${cat})`;
            })
            .join(" + ");
          const qadih = isQadih(n?.narrator?.harshest_grade_en ?? null);
          return (
            <div className="taan-row" key={i}>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 700 }}>{name}</div>
              <div style={{ color: "var(--ink-2)" }}>{criticsText}</div>
              <div style={{ color: "var(--ink-1)", lineHeight: 1.65 }}>{reasonsText}</div>
              <div>
                <span className={`pill pill-md ${qadih ? "pill-rejected" : "pill-neutral"}`}>
                  <span className="pill-dot" aria-hidden="true" />
                  {qadih ? "قادح" : "غير قادح"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="taan-foot">
        مرجع التصنيف: المراتب الثمانية للجرح والتعديل عند ابن أبي حاتم والذهبي وابن حجر.
      </p>
    </>
  );
}

function NisbahBadge({ nisbah }: { nisbah: NisbahResult }) {
  const s = NISBAH_STYLE[nisbah.type];
  const tone =
    nisbah.type === "marfu_sarih" || nisbah.type === "marfu_hukman"
      ? "pill-sahabi"
      : nisbah.type === "qudsi"
        ? "pill-weak"
        : "pill-neutral";
  return (
    <span className={`pill pill-md ${tone}`} title={nisbah.reason}>
      <span aria-hidden>{s.symbol}</span>
      {nisbah.label}
    </span>
  );
}

/** Surfaces chain-level tadlīs classification («تقسيمات التدليس»). Three known
 *  types: الإسناد، التسوية، الشيوخ. We auto-detect the first two; the third
 *  requires a curated obscure-names database we don't have yet. */
/** Ibn Ḥajar's five-tier classification of المدلسين in his «طبقات المدلسين»
 *  — verified from Suhaib Hasan's «Intro to Sciences of Hadith» and the
 *  standard editions. Each tier has a distinct juristic consequence. */
const MUDALLIS_TIER_AR: Record<number, { ordinal: string; gloss: string }> = {
  1: {
    ordinal: "المرتبة الأولى",
    gloss: "من لم يوصف بالتدليس إلا نادرًا — يُحتجّ بمعنعنهم.",
  },
  2: {
    ordinal: "المرتبة الثانية",
    gloss: "الذين احتمل الأئمة تدليسهم وأخرجوا لهم في الصحيح لإمامتهم أو لقلّة تدليسهم.",
  },
  3: {
    ordinal: "المرتبة الثالثة",
    gloss: "أكثروا من التدليس فلم يحتجّ الأئمة بمعنعنهم إلا بتصريح السماع.",
  },
  4: {
    ordinal: "المرتبة الرابعة",
    gloss: "اتُّفق على عدم الاحتجاج بهم إلا بتصريح السماع لكثرة تدليسهم عن الضعفاء.",
  },
  5: {
    ordinal: "المرتبة الخامسة",
    gloss: "ضُعِّفوا بأمر آخر سوى التدليس فلا تُقبل روايتهم ولو صرَّحوا بالسماع.",
  },
};

function TadlisPanel({
  tadlis,
  narrators,
  links,
}: {
  tadlis: TadlisSummary;
  narrators: MatchResult["narrators"];
  links: MatchResult["links"];
}) {
  // Find mudallis narrators in this chain (those with a recorded tier).
  const mudallisList = narrators
    .filter((n) => n.narrator?.tadlis_tier != null)
    .map((n) => ({
      name: n.narrator!.full_name,
      tier: n.narrator!.tadlis_tier as number,
      position: n.position,
    }));

  if (mudallisList.length === 0) {
    return (
      <div>
        <p style={{ fontSize: 14, lineHeight: 1.85, color: "var(--ink-1)" }}>
          لم يقع في رواة هذا الإسناد من رُمي بالتدليس عند ابن حجر — السلسلة
          سالمةٌ من احتمال الانقطاع الخفي.
        </p>
        <ul className="bullet-list">
          <li>الإسناد متّصل بسماع مصرَّح به أو محمول على السماع في كلّ طبقاته.</li>
          <li>التدليس هنا غير وارد أصلًا — لا حاجة لإثبات السماع.</li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      {mudallisList.map((m, i) => {
        const tierInfo = MUDALLIS_TIER_AR[m.tier];
        // Did this specific mudallis declare samaa on his link in this chain?
        // The link FROM this narrator (as student) carries his transmission.
        const myLink = links.find((l) => l.from_position === m.position);
        const samaaProven = myLink?.attestation_verb?.verb === "samaa";
        const samaaPhrase = myLink?.attestation_verb?.phrase_ar;
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 14, lineHeight: 1.85, color: "var(--ink-1)", marginBottom: 8 }}>
              الإسناد فيه مُدلِّس{mudallisList.length === 1 ? " واحد" : ""}:{" "}
              <b>{m.name}</b>
              {tierInfo && (
                <>
                  {" "}— وهو في <b>{tierInfo.ordinal}</b> من مراتب المدلسين عند ابن حجر ({tierInfo.gloss})
                </>
              )}
              .
            </p>
            {samaaProven && samaaPhrase && (
              <p style={{ fontSize: 14, lineHeight: 1.85, color: "var(--ink-1)", marginBottom: 8 }}>
                في هذا الإسناد بالذات صرَّح بالسماع:{" "}
                <span style={{ fontFamily: "var(--f-mono, monospace)", fontSize: 13.5 }}>
                  «{samaaPhrase}»
                </span>
                ، فانتفت العلّة المظنونة وزال احتمال الانقطاع الخفي.
              </p>
            )}
          </div>
        );
      })}
      <ul className="bullet-list">
        <li>
          {mudallisList.length === 1
            ? "لا يوجد في باقي الرواة من رُمي بتدليس."
            : `وقع التدليس في ${mudallisList.length} من رواة الإسناد.`}
        </li>
        <li>
          {links.every((l) => l.attestation_verb?.verb === "samaa")
            ? "الإسناد متّصل بسماع مصرَّح به في كلّ طبقاته."
            : "بعض طبقات الإسناد محمولة على السماع دون تصريح."}
        </li>
        <li>
          الحكم:{" "}
          {tadlis.hasTaswiya ? (
            <span className="pill pill-md pill-rejected">
              <span className="pill-dot" aria-hidden="true" /> قادح
            </span>
          ) : tadlis.hasIsnad ? (
            <span className="pill pill-md pill-weak">
              <span className="pill-dot" aria-hidden="true" /> وقفٌ في القبول
            </span>
          ) : (
            <span className="pill pill-md pill-strong">
              <span className="pill-dot" aria-hidden="true" /> غير قادح
            </span>
          )}
          {" — "}
          {tadlis.hasTaswiya
            ? "تدليس التسوية يُسقط الإسناد."
            : tadlis.hasIsnad
              ? "التدليس هنا محتاج إلى تثبُّت."
              : "التدليس هنا غير قادح."}
        </li>
      </ul>
    </div>
  );
}

function TadlisRow({
  present,
  label,
  definition,
  instances,
  unavailable,
  unavailableNote,
}: {
  present: boolean;
  label: string;
  definition: string;
  instances: { narratorName: string; reason: string }[];
  unavailable?: boolean;
  unavailableNote?: string;
}) {
  const tone = unavailable
    ? "border-gray-200 bg-gray-50"
    : present
      ? "border-red-300 bg-red-50"
      : "border-emerald-200 bg-emerald-50/50";
  const icon = unavailable ? "—" : present ? "⚠" : "✓";
  const iconColor = unavailable
    ? "text-gray-500"
    : present
      ? "text-red-700"
      : "text-emerald-700";
  const verdictText = unavailable
    ? "غير متوفِّر"
    : present
      ? `وقع في ${instances.length} موضع`
      : "لم يُكتشف";
  return (
    <details className={`rounded-lg border ${tone} p-2`}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm">
        <span className={`text-base ${iconColor}`}>{icon}</span>
        <span className="font-bold text-gray-900">{label}</span>
        <span className="ms-auto text-xs text-gray-700">{verdictText}</span>
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-gray-700">{definition}</p>
      {present && instances.length > 0 && (
        <ul className="mt-2 space-y-1 ms-4 list-disc text-xs text-gray-900">
          {instances.map((inst, i) => (
            <li key={i}>
              <span className="font-medium">{inst.narratorName}</span> —{" "}
              <span className="text-gray-700">{inst.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {unavailable && unavailableNote && (
        <p className="mt-2 text-[11px] italic text-gray-600">
          {unavailableNote}
        </p>
      )}
    </details>
  );
}

function RuleFooter() {
  return (
    <div>
      <ol className="method-list">
        <li>استخراج المتن من النصّ المُدخَل بقطع أداة التحويل عن صيغ الأداء (حدثنا، أخبرنا، عن…).</li>
        <li>قطع السلسلة إلى رواة مُفرَدين وترتيبهم من المُسنَد إليه (النبي ﷺ) إلى المُخرِّج.</li>
        <li>تمييز الرواة المتشابهين في الأسماء بمعايير الطبقة، والشيوخ، والتلاميذ.</li>
        <li>الكشف في كتب الرجال الـ٢٢ ترتيبًا ثابتًا، واستخلاص أشدّ ما قيل وأرفعه.</li>
        <li>تحليل الاتصال والتدليس وأي علّة قادحة في خصوص هذا الإسناد.</li>
        <li>إصدار الحكمين: حكمٌ خاصٌّ بهذا الإسناد، وحكمٌ عامٌّ بمجموع طرق المتن في الكتب الـ١٨.</li>
      </ol>
      <p className="method-foot">
        مصادر التخريج: ١٨ كتاب حديث — مصادر الجرح والتعديل والتعريف بالرواة: ٢٢ كتاب رجال —
        إثبات السماع: «التاريخ الكبير» للبخاري — إثبات عدم اللقاء: «المراسيل» لابن أبي حاتم.
      </p>
    </div>
  );
}

function gradeBadge(grade: string | null): { className: string; label: string } | null {
  if (!grade) return null;
  // Always render the label in Arabic — the corpus rows store grades as
  // either "Sahih"/"Hasan"/"Daif" (English) or already-Arabic strings;
  // normalise to consistent Arabic so users never see English here.
  if (/sahih/i.test(grade)) return { className: "bg-green-100 text-green-800", label: "صحيح" };
  if (/hasan/i.test(grade)) return { className: "bg-emerald-100 text-emerald-800", label: "حسن" };
  if (/da'?i?f/i.test(grade)) return { className: "bg-orange-100 text-orange-800", label: "ضعيف" };
  if (/صحيح/.test(grade)) return { className: "bg-green-100 text-green-800", label: grade };
  if (/حسن/.test(grade)) return { className: "bg-emerald-100 text-emerald-800", label: grade };
  if (/ضعيف/.test(grade)) return { className: "bg-orange-100 text-orange-800", label: grade };
  return { className: "bg-gray-100 text-gray-700", label: grade };
}

// Tag for the small inline "our app's verdict" badge per corpus match.
const APP_VERDICT_STYLE: Record<
  ChainVerdict,
  { className: string; label: string }
> = {
  sahih_candidate: { className: "bg-green-100 text-green-900", label: "صحيح" },
  hasan_candidate: { className: "bg-emerald-100 text-emerald-900", label: "حسن" },
  daif: { className: "bg-orange-100 text-orange-900", label: "ضعيف" },
  broken: { className: "bg-red-100 text-red-900", label: "منقطع" },
  needs_review: { className: "bg-amber-100 text-amber-900", label: "يحتاج إلى مراجعة" },
};

/** Small inline tag rendered next to «حكم الكتاب» — clicking it triggers
 *  one full audit on the corpus match's chain and replaces itself with the
 *  app's verdict, so the user can see Book vs App side-by-side. */
function AppVerdictTag({
  state,
  onCompute,
}: {
  state: { verdict: ChainVerdict; reason: string } | "loading" | "error" | undefined;
  onCompute: (e: React.MouseEvent) => void;
}) {
  if (state === "loading") {
    return (
      <span className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
        ⏳ جارٍ فحص التطبيق…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
        ⚠ تعذّر الفحص
      </span>
    );
  }
  if (state && typeof state === "object") {
    const v = APP_VERDICT_STYLE[state.verdict];
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${v.className}`}
          title={state.reason}
        >
          🧮 حكم تطبيقنا على هذا السند: {v.label}
        </span>
      </span>
    );
  }
  // Not yet computed — show the trigger button.
  return (
    <button
      type="button"
      onClick={onCompute}
      className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100"
      title="انقر ليُعيد التطبيق تحليل سند هذه الرواية بقاعدته الخاصة، فترى حكمه إلى جوار حكم صاحب الكتاب"
    >
      🧮 احسب حكم تطبيقنا على هذا السند
    </button>
  );
}

function CorpusMatches({
  matches,
  chainTooShort,
  onAuditFullChain,
}: {
  matches: HadithMatch[];
  /** True when the user's pasted chain has fewer than 2 named narrators —
   *  most likely matn-only paste, no isnād to verify. */
  chainTooShort: boolean;
  /** Caller wants to re-audit using the full text of one corpus match. */
  onAuditFullChain: (arabicFull: string) => void;
}) {
  // Per-match cached app verdict. Computed lazily on the user's click — too
  // expensive to compute for every match upfront (one full audit per row).
  const [appVerdicts, setAppVerdicts] = useState<
    Record<number, { verdict: ChainVerdict; reason: string } | "loading" | "error">
  >({});

  async function computeAppVerdict(m: HadithMatch) {
    if (appVerdicts[m.id] === "loading") return;
    setAppVerdicts((s) => ({ ...s, [m.id]: "loading" }));
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isnad: m.arabic_full }),
      });
      if (!res.ok) {
        setAppVerdicts((s) => ({ ...s, [m.id]: "error" }));
        return;
      }
      const body = (await res.json()) as MatchResult;
      setAppVerdicts((s) => ({
        ...s,
        [m.id]: { verdict: body.chain_verdict, reason: body.chain_reason },
      }));
    } catch {
      setAppVerdicts((s) => ({ ...s, [m.id]: "error" }));
    }
  }

  // Dedupe by (book, hadith_in_book) — same hadith may appear in multiple
  // chapters or have near-duplicate rows from the importer; keep best score.
  const deduped = Array.from(
    matches
      .reduce<Map<string, typeof matches[number]>>((acc, m) => {
        const key = `${m.book_id}#${m.hadith_in_book ?? m.id}`;
        const prev = acc.get(key);
        if (!prev || m.score > prev.score) acc.set(key, m);
        return acc;
      }, new Map())
      .values(),
  ).sort((a, b) => b.score - a.score);

  return (
    <section className="card corpus-card" dir="rtl">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">التخريج</div>
          <h2 className="section-title">
            مواضع المتن في الكتب الأصول — {deduped.length} مصدراً
          </h2>
        </div>
      </div>
      {chainTooShort && matches.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: 12,
            background: "var(--amber-bg)",
            borderColor: "var(--amber-rule)",
            color: "var(--amber-fg)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
            💡 ما لصقتَه يحوي المتن دون السلسلة الكاملة.
          </p>
          <p style={{ marginTop: 4, fontSize: 12.5, color: "var(--ink-2)" }}>
            اضغط على «تدقيق بإسناد هذا الكتاب» بجانب أي كتاب أدناه ليُعاد الفحص
            باستخدام السند المسجَّل في ذلك الكتاب.
          </p>
        </div>
      )}
      <table className="corpus-table">
        <colgroup>
          <col />
          <col style={{ width: "90px" }} />
          <col style={{ width: "180px" }} />
          <col style={{ width: "180px" }} />
          <col style={{ width: "180px" }} />
          <col style={{ width: "auto" }} />
        </colgroup>
        <thead>
          <tr className="corpus-head">
            <th>الكتاب</th>
            <th>رقم الحديث</th>
            <th>حكم صاحب الكتاب</th>
            <th>حكم تطبيقنا</th>
            <th>تشابه المتن</th>
            <th className="sr-only">إعادة التدقيق</th>
          </tr>
        </thead>
        <tbody>
          {deduped.map((m) => {
            const badge = gradeBadge(m.grade);
            return (
              <tr key={m.id}>
                <td className="corpus-book">{m.book_name_ar}</td>
                <td className="corpus-num mono">
                  {m.hadith_in_book ?? "—"}
                </td>
                <td>
                  {badge ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      title="حكم مصنِّف الكتاب أو محقِّقه على هذه الرواية"
                    >
                      {badge.label}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  )}
                </td>
                <td>
                  <AppVerdictTag
                    state={appVerdicts[m.id]}
                    onCompute={(e) => {
                      e.preventDefault();
                      computeAppVerdict(m);
                    }}
                  />
                </td>
                <td className="corpus-sim">
                  <div className="sim-wrap">
                    <span className="sim-num mono">{Math.round(m.score * 100)}٪</span>
                    <span className="sim-bar" aria-hidden="true">
                      <span className="sim-fill" style={{ width: `${Math.round(m.score * 100)}%` }} />
                    </span>
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="reaudit-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      onAuditFullChain(m.arabic_full);
                    }}
                    title={`إعادة التدقيق باستخدام إسناد ${m.book_name_ar}`}
                  >
                    تدقيق بإسناد هذا الكتاب
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function HomePage() {
  const [isnad, setIsnad] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function audit(textOverride?: string) {
    const text = textOverride ?? isnad;
    if (textOverride !== undefined) setIsnad(textOverride);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isnad: text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "حدث خطأ ما.");
        return;
      }
      setResult(body as MatchResult);
      // Bring the result back into view after a programmatic re-audit.
      if (textOverride !== undefined) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("تعذّر الاتصال بالخادم — حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  const hasChain = result && result.narrators.length > 0;
  const hasContent =
    result && (result.narrators.length > 0 || result.corpus_matches.length > 0 || result.matn);

  // Editor expansion — start expanded if no result, auto-collapse on the
  // first audit result. After that, the user controls it via the toggle.
  // The auto-collapse must run as an effect (not in render) or it will
  // slam the editor closed on every re-render and the toggle button looks
  // like it does nothing.
  const [editorOpen, setEditorOpen] = useState(true);
  const autoCollapsed = useRef(false);
  useEffect(() => {
    if (result && !autoCollapsed.current) {
      setEditorOpen(false);
      autoCollapsed.current = true;
    }
  }, [result]);

  return (
    <main dir="rtl" className="page">
      {/* ─── Header ─── */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M6 4v16M18 4v16M6 12h12" />
            </svg>
          </div>
          <div>
            <div className="brand-name">إسناد</div>
            <div className="brand-tagline">تدقيقٌ آليٌّ لسلاسل رواة الحديث</div>
          </div>
        </div>
        <div className="header-meta">
          {result && (
            <span className="meta-chip">
              تمّ التدقيق عبر <b>{result.narrators.length}</b> راوٍ
            </span>
          )}
        </div>
      </header>

      {/* ─── Input block (always present; collapsible after first audit) ─── */}
      <section className="card input-card">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">المُدْخَل</div>
            <h2 className="section-title">
              {result ? "نصّ الإسناد المُدرَج" : "ألصق الحديث (المتن والإسناد)"}
            </h2>
          </div>
          {result && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setEditorOpen((o) => !o)}
              aria-expanded={editorOpen}
            >
              {editorOpen ? "إخفاء المحرِّر" : "تعديل النص"}
            </button>
          )}
        </div>

        {editorOpen ? (
          <div className="isnad-editor">
            <textarea
              dir="rtl"
              className="isnad-textarea"
              value={isnad}
              onChange={(e) => setIsnad(e.target.value)}
              placeholder="… ألصق إسناد الحديث هنا"
              suppressHydrationWarning
            />
            <div className="isnad-editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => audit()}
                disabled={loading || isnad.trim().length === 0}
                suppressHydrationWarning
              >
                {loading ? "… جارٍ الفحص" : result ? "⟲ إعادة التدقيق" : "افحص الحديث"}
              </button>
              {!result && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setIsnad(EXAMPLE)}
                >
                  مثال
                </button>
              )}
              {result && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setEditorOpen(false)}
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="isnad-raw" dir="rtl">{isnad}</div>
            <div className="input-meta">
              <span>تمّ استخراج <b>{result?.narrators.length ?? 0} رواة</b> + المتن</span>
              {result?.nisbah && (
                <>
                  <span className="dot" aria-hidden="true">•</span>
                  <span>{result.nisbah.label}</span>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {error && (
        <div
          className="card"
          style={{ borderColor: "var(--red-rule)", background: "var(--red-bg)", color: "var(--red-fg)" }}
        >
          {error}
        </div>
      )}

      {result && (
        <>
          {!hasContent && (
            <div className="card" style={{ color: "var(--ink-2)" }}>
              لم يُعثر على إسناد أو حديث.
            </div>
          )}

          {/* ─── Matn (large Amiri, manuscript brackets) ─── */}
          {result.matn && (
            <section className="card matn-card">
              <div className="section-head">
                <div>
                  <div className="section-eyebrow">المتن المستخرَج</div>
                  <h2 className="section-title">نصّ الحديث</h2>
                </div>
              </div>
              <blockquote className="matn">
                <p>{result.matn}</p>
              </blockquote>
            </section>
          )}

          {/* ─── Two-tier verdict ─── */}
          {hasChain && (
            <section className="card">
              <div className="section-head">
                <div>
                  <div className="section-eyebrow">الحكم</div>
                  <h2 className="section-title">
                    حكمان منفصلان — على هذا الإسناد، وعلى الحديث في مجموع طرقه
                  </h2>
                </div>
              </div>
              <div className="verdict-grid">
                {/* Tier A — this specific chain */}
                <div className="verdict-tier verdict-tier-a">
                  <span className="tier-rail" aria-hidden="true" />
                  <div className="tier-scope">النطاق ① — هذا الإسناد وحده</div>
                  <div className="tier-headline">
                    {result.rank && <RankBadge rank={result.rank} />}
                    {result.acceptance && <AcceptanceBadge acceptance={result.acceptance} />}
                  </div>
                  {result.saqt && (
                    <div className="tier-row">
                      <span className="tier-key">السَّقْط</span>
                      <span className="tier-val">
                        {result.saqt.type === "none" ? "لا سَقْط في الإسناد" : result.saqt.label}
                      </span>
                    </div>
                  )}
                  <ul className="tier-reasons">
                    {buildTierAChecklist(result).map((item, i) => (
                      <li key={i}>
                        <span className={item.ok ? "tier-tick" : "tier-cross"} aria-hidden="true">
                          {item.ok ? "✓" : "✗"}
                        </span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Tier B — the whole hadith across all known chains */}
                <div className="verdict-tier verdict-tier-b">
                  <span className="tier-rail" aria-hidden="true" />
                  <div className="tier-scope">النطاق ② — الحديث في جميع طرقه</div>
                  <div className="tier-headline">
                    {result.nisbah && <NisbahBadge nisbah={result.nisbah} />}
                    {result.number && <NumberBadge number={result.number} />}
                  </div>
                  {result.nisbah && (
                    <div className="tier-row">
                      <span className="tier-key">نسبة الرفع</span>
                      <span className="tier-val">{result.nisbah.reason}</span>
                    </div>
                  )}
                  {result.number && (
                    <div className="tier-row">
                      <span className="tier-key">تفصيل الغرابة</span>
                      <span className="tier-val">{result.number.reason}</span>
                    </div>
                  )}
                  <div className="tier-row">
                    <span className="tier-key">الشهرة</span>
                    <span className="tier-val">{shuhraText(result)}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ─── Share box: copy-paste for X ─── */}
          {hasChain && <ShareBox result={result} />}

          {/* ─── Corpus matches ─── */}
          {result.corpus_matches.length > 0 && (
            <CorpusMatches
              matches={result.corpus_matches}
              chainTooShort={result.narrators.length <= 2}
              onAuditFullChain={(arabicFull) => audit(arabicFull)}
            />
          )}

          {/* ─── Chain diagram ─── */}
          {hasChain && (
            <section className="card chain-card">
              <div className="section-head">
                <div>
                  <div className="section-eyebrow">سلسلة الإسناد</div>
                  <h2 className="section-title">
                    السند مرتّباً — النبيُّ ﷺ في الأعلى، شيخ المُخرِّج في الأسفل
                  </h2>
                </div>
                <div className="chain-legend">
                  <span><span className="lg-dot lg-strong" /> ثقة فما فوق</span>
                  <span><span className="lg-dot lg-good" /> صدوق</span>
                  <span><span className="lg-dot lg-weak" /> ضعيف / لين</span>
                  <span><span className="lg-dot lg-rejected" /> مردود</span>
                </div>
              </div>
              {result.itibar_note && (
                <p className="itibar-note">{result.itibar_note}</p>
              )}
              <IsnadDiagram
                narrators={result.narrators}
                links={result.links}
                branches={result.has_multiple_branches ? result.branches : undefined}
              />
            </section>
          )}

          {/* ─── Analytical detail accordions — one per topic ─── */}
          {hasChain && (
            <div className="acc-stack">
              {result.tadlis && (
                <section className="card acc-card">
                  <details>
                    <summary className="acc-head" style={{ listStyle: "none" }}>
                      <div>
                        <div className="section-eyebrow">الفصل</div>
                        <span style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700 }}>
                          تحليل التدليس في هذا الإسناد
                        </span>
                      </div>
                      <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 18 }}>▾</span>
                    </summary>
                    <div className="acc-body">
                      <TadlisPanel
                        tadlis={result.tadlis}
                        narrators={result.narrators}
                        links={result.links}
                      />
                    </div>
                  </details>
                </section>
              )}
              {result.tanByNarrator && result.tanByNarrator.length > 0 && (
                <section className="card acc-card">
                  <details>
                    <summary className="acc-head" style={{ listStyle: "none" }}>
                      <div>
                        <div className="section-eyebrow">الفصل</div>
                        <span style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700 }}>
                          أسباب الطعن — مَن جُرِح ولِمَ
                        </span>
                      </div>
                      <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 18 }}>▾</span>
                    </summary>
                    <div className="acc-body">
                      <TanPanel narrators={result.narrators} tan={result.tanByNarrator} />
                    </div>
                  </details>
                </section>
              )}
              <section className="card acc-card">
                <details>
                  <summary className="acc-head" style={{ listStyle: "none" }}>
                    <div>
                      <div className="section-eyebrow">منهجيّة العمل</div>
                      <span style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700 }}>
                        منهج التخريج والحُكْم
                      </span>
                    </div>
                    <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 18 }}>▾</span>
                  </summary>
                  <div className="acc-body">
                    <RuleFooter />
                  </div>
                </details>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
