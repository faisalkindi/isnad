"use client";

import { Fragment, useEffect, useState } from "react";
import type {
  ChainLink,
  MatchedNarrator,
} from "@/lib/match/matcher";
import type { NarratorMiniRef } from "@/lib/match/candidates";
import type {
  DisagreementSummary,
  NarratorDetail,
  SourceGrade,
} from "@/lib/narrator";
import { isMentionOnly } from "@/lib/narrator-helpers";
import { sourceBookAr, sourceBookMeta, ALL_RIJAL_BOOKS } from "@/lib/sources";
import { FORMULA_LABEL_AR } from "@/lib/match/formula";
import { gradeStyle } from "@/lib/grades";
import { shortName, primaryDeathYear, tabaqatShort } from "@/lib/names";
import { lookupJarhTerm, tierLabel } from "@/lib/jarh-terms";

// Per-grade colors for the large narrator disk (saturated, high contrast).
const DISK_BG: Record<string, string> = {
  prophet: "bg-amber-600",
  companion: "bg-purple-600",
  reliable: "bg-emerald-700",
  mostly_reliable: "bg-emerald-500",
  weak: "bg-orange-500",
  abandoned: "bg-red-600",
  fabricator: "bg-red-800",
  unknown: "bg-gray-400",
};

const GRADE_LABEL_AR: Record<string, string> = {
  prophet: "المصدر",
  companion: "صحابي",
  reliable: "ثقة",
  mostly_reliable: "صدوق",
  weak: "ضعيف",
  abandoned: "متروك",
  fabricator: "متهم بالكذب",
  unknown: "غير معروف الحال",
};

function diskBg(gradeEn: string | null | undefined): string {
  return DISK_BG[gradeEn ?? ""] ?? "bg-gray-400";
}

function gradeLabel(gradeEn: string | null | undefined): string {
  return GRADE_LABEL_AR[gradeEn ?? ""] ?? "غير معروف الحال";
}

/** Same policy as matcher.ts `effectiveGrade`: harshest jarh wins, except
 *  Companions (who are عدول by consensus). User-set policy: always
 *  surface the harshest grade in the DB — don't hide parser-noise. */
function effectiveGradeEn(
  gradeEn: string | null | undefined,
  tabaqat: string | null | undefined,
  gradeAr: string | null | undefined,
  harshestGradeEn?: string | null,
): string {
  const t = tabaqat ?? "";
  const g = gradeAr ?? "";
  if (/صحاب|صحبة|له\s+رؤية|العشرة/.test(t) || /صحاب|صحبة|له\s+صحبة/.test(g)) {
    return "companion";
  }
  return harshestGradeEn ?? gradeEn ?? "";
}

/** "—" when missing; otherwise the value (Itqan stores "-" for missing). */
function display(v: string | null | undefined): string | null {
  return v && v !== "-" ? v : null;
}

const CONFIDENCE_AR: Record<string, string> = {
  high: "ثقة عالية",
  medium: "ثقة متوسطة",
  low: "ثقة منخفضة",
};

/** Visual vertical isnād chain — the Prophet ﷺ at the top (source) and the
 *  compiler's teacher at the bottom. Each narrator is a colored node
 *  connected by chronologically-aware link lines. Click a node to expand.
 *
 *  Multi-branch hadiths (Muslim's «ح» or «وعن X» pivot-forks): pass `branches`
 *  and each branch is rendered as its own stacked spine with a header pill +
 *  verdict pill, so iʿtibār is visible. */
export function IsnadDiagram({
  narrators,
  links,
  branches,
}: {
  narrators: MatchedNarrator[];
  links: ChainLink[];
  branches?: {
    label: string;
    narrators: MatchedNarrator[];
    links: ChainLink[];
    chain_verdict: string;
  }[];
}) {
  // Single-chain hadiths or callers that haven't migrated → existing spine.
  if (!branches || branches.length <= 1) {
    return <SingleChainSpine narrators={narrators} links={links} />;
  }
  // Multi-branch: stack each branch as its own labelled spine. Repetition of
  // the shared compiler-side stem in each branch is intentional — it makes
  // each chain readable on its own (matches how KHASHAF and printed ICMA
  // diagrams present mutābaʿāt).
  return (
    <div className="branches-stack" dir="rtl">
      {branches.map((b, i) => (
        <section key={i} className="branch-panel">
          <header className="branch-header">
            <span className="branch-label">{b.label}</span>
            <BranchVerdictPill verdict={b.chain_verdict} />
          </header>
          <SingleChainSpine narrators={b.narrators} links={b.links} />
        </section>
      ))}
    </div>
  );
}

function BranchVerdictPill({ verdict }: { verdict: string }) {
  const map: Record<string, { ar: string; tone: string }> = {
    sahih_candidate: { ar: "ظاهره الصحة", tone: "pill-strong" },
    hasan_candidate: { ar: "ظاهره الحسن", tone: "pill-good" },
    daif: { ar: "ضعيف", tone: "pill-weak" },
    broken: { ar: "منقطع", tone: "pill-rejected" },
    needs_review: { ar: "يحتاج مراجعة", tone: "pill-neutral" },
  };
  const m = map[verdict] ?? { ar: verdict, tone: "pill-neutral" };
  return (
    <span className={`pill pill-md ${m.tone}`}>
      <span className="pill-dot" aria-hidden="true" />
      {m.ar}
    </span>
  );
}

function SingleChainSpine({
  narrators,
  links,
}: {
  narrators: MatchedNarrator[];
  links: ChainLink[];
}) {
  // Pasted order is compiler-first; display order is source-first (the
  // Prophet at the top, transmission flowing down to the compiler's teacher).
  const reversed = [...narrators].reverse();
  const total = reversed.length;

  return (
    <div className="chain-stream" dir="rtl">
      <div className="chain-spine" aria-hidden="true" />
      {reversed.map((n, displayIdx) => {
        const below = reversed[displayIdx + 1];
        const link = below
          ? links.find(
              (l) =>
                l.from_position === below.position &&
                l.to_position === n.position,
            )
          : undefined;
        // The link between the Prophet ﷺ and his Companion is established by
        // ṣuḥba — the classical rule «الصحابة كلّهم عدول» — so chronology
        // gap, tadlīs warnings, and corpus shawāhid checks are inapplicable.
        // Render a clean ṣuḥba note instead.
        const isProphetLink = n.is_source === true && below !== undefined;
        return (
          <Fragment key={n.position}>
            <NarratorRow
              matched={n}
              displayNumber={displayIdx + 1}
              total={total}
            />
            {below && (isProphetLink ? <ProphetLink /> : <LinkConnector link={link} />)}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ---------- one narrator: header + expandable body ---------- */

/** Map app grade tier → CSS rail/dot class for the chain visualisation. */
function railFor(grade: string): string {
  if (grade === "companion") return "sahabi";
  if (grade === "prophet") return "sahabi";
  if (grade === "reliable") return "strong";
  if (grade === "mostly_reliable") return "good";
  if (grade === "weak") return "weak";
  if (grade === "abandoned" || grade === "fabricator") return "rejected";
  return "neutral";
}

function NarratorRow({
  matched,
  displayNumber,
  total,
}: {
  matched: MatchedNarrator;
  displayNumber: number;
  total: number;
}) {
  // The Prophet ﷺ — special render: no expand, no fetch, no candidates.
  if (matched.is_source) {
    return (
      <div className="narrator-node narrator-prophet">
        <div className="spine-dot spine-dot-prophet" aria-hidden="true" />
        <div className="prophet-card">
          <div className="prophet-name">{matched.narrator?.full_name}</div>
          <div className="prophet-sub">المصدر · توفي ١١ هـ · رقم {displayNumber} من {total}</div>
        </div>
      </div>
    );
  }

  const [chosenId, setChosenId] = useState<number | null>(
    matched.narrator?.id ?? null,
  );
  const [expanded, setExpanded] = useState(matched.status !== "matched");
  const [detail, setDetail] = useState<NarratorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(matched.status !== "matched");

  useEffect(() => {
    if (chosenId == null || !expanded) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/narrator/${chosenId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NarratorDetail | null) => {
        if (!cancelled) setDetail(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chosenId, expanded]);

  const fullName = matched.narrator?.full_name ?? matched.fragment;
  const compactName = matched.narrator
    ? shortName(matched.narrator.full_name)
    : matched.fragment;
  const deathInfo = primaryDeathYear(matched.narrator?.death);
  const tabaqat = tabaqatShort(matched.narrator?.tabaqat);
  const grade = effectiveGradeEn(
    matched.narrator?.grade_en,
    matched.narrator?.tabaqat,
    matched.narrator?.grade_ar,
    matched.narrator?.harshest_grade_en,
  );
  const userCorrected = chosenId !== (matched.narrator?.id ?? null);
  const gradeBadge = gradeStyle(grade);

  const rail = railFor(grade);
  const isCompanion = grade === "companion";

  return (
    <div className="narrator-node">
      <div className={`spine-dot spine-dot-${rail}`} aria-hidden="true" />
      <div className="narrator-card">
        <span className={`narrator-rail rail-${rail}`} aria-hidden="true" />
        <button
          type="button"
          className="narrator-header"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <div className="narrator-header-main">
            <div className="narrator-position">
              رقم {displayNumber} من {total}
            </div>
            <div className="narrator-name" title={fullName}>
              {compactName}
            </div>
            <div className="narrator-meta-row">
              {deathInfo && (
                <span className="meta-death">
                  ت {deathInfo.year}
                  {deathInfo.hasAlternatives && (
                    <span style={{ opacity: 0.6, fontSize: 11 }}> ~</span>
                  )}
                </span>
              )}
              {tabaqat && <span className="meta-tabaqa">{tabaqat}</span>}
              {isCompanion && <span className="badge badge-sahabi">صحابي</span>}
              {matched.narrator?.tadlis_tier != null && (
                <TadlisBadge tier={matched.narrator.tadlis_tier} />
              )}
              {matched.status === "needs_review" && (
                <span className="badge badge-tadlis">بحاجة إلى مراجعة</span>
              )}
              {matched.status === "not_found" && (
                <span className="badge" style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)", border: "1px solid var(--neutral-rule)" }}>
                  لم يُعرَف
                </span>
              )}
            </div>
          </div>
          <div className="narrator-header-grade">
            <span
              className={`pill pill-md ${
                grade === "reliable" || grade === "companion"
                  ? "pill-strong"
                  : grade === "mostly_reliable"
                    ? "pill-good"
                    : grade === "weak"
                      ? "pill-weak"
                      : grade === "abandoned" || grade === "fabricator"
                        ? "pill-rejected"
                        : "pill-neutral"
              }`}
              title={
                matched.narrator?.harshest_grade_en &&
                matched.narrator.harshest_grade_en !== matched.narrator.grade_en
                  ? `أشدّ نقدٍ: «${matched.narrator.harshest_grade_ar}» في ${matched.narrator.harshest_source_book ?? "كتب الرجال"}`
                  : undefined
              }
            >
              <span className="pill-dot" aria-hidden="true" />
              {gradeLabel(grade)}
              {matched.narrator?.harshest_grade_en &&
                matched.narrator.harshest_grade_en !==
                  matched.narrator.grade_en && (
                  <span style={{ marginInlineStart: 4, opacity: 0.7, fontSize: 11 }}>⚖</span>
                )}
            </span>
            {matched.narrator && (
              <SourceVerdictsBadge
                verdicts={matched.narrator.source_verdicts ?? []}
              />
            )}
            <span className={`chevron ${expanded ? "rot" : ""}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M 4 6 L 8 10 L 12 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </button>

      {expanded && (
        <div className="narrator-body">
          {(matched.candidates.length > 0 && (picking || chosenId == null)) && (
            <div className="mb-3">
              {chosenId == null && (
                <p className="mb-2 text-gray-800">
                  {matched.candidates.length === 0
                    ? "تعذّر التعرّف على هذا الراوي."
                    : "تحتاج هذه المطابقة إلى مراجعة — اختر الراوي المقصود:"}
                </p>
              )}
              <ul className="space-y-1">
                {matched.candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosenId(c.id);
                        setPicking(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-start hover:border-emerald-500"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-block h-4 w-4 rounded-full ${diskBg(c.grade_en)}`}
                          aria-hidden
                        />
                        <span>{c.full_name}</span>
                      </span>
                      <span className="text-xs text-gray-600">
                        {gradeLabel(c.grade_en)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {chosenId != null && !picking && (
            <>
              {loading && <p style={{ color: "var(--ink-3)" }}>جارٍ التحميل…</p>}
              {!loading && detail && (
                <>
                  {/* Identity grid — 4 cols on desktop, 2 on mobile (CSS) */}
                  <div className="narrator-identity">
                    <div>
                      <div className="stat-label">الاسم</div>
                      <div className="stat-value">{detail.full_name}</div>
                    </div>
                    <div>
                      <div className="stat-label">الكنية / النسب</div>
                      <div className="stat-value">
                        {detail.kunya ?? "—"}
                        {detail.laqab && (
                          <span style={{ color: "var(--ink-3)" }}> · {detail.laqab}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">سنة الوفاة</div>
                      <div className="stat-value">
                        {matched.narrator?.death && matched.narrator.death !== "-"
                          ? matched.narrator.death
                          : detail.death ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">الطبقة</div>
                      <div className="stat-value">{detail.tabaqat ?? "—"}</div>
                    </div>
                  </div>

                  {/* Harshest grade panel — the strongest jarh found across
                      all rijal sources, surfaced prominently per user policy. */}
                  {matched.narrator?.harshest_grade_ar &&
                  matched.narrator.harshest_grade_en !== matched.narrator.grade_en ? (
                    <div className="harshest-block">
                      <div className="harshest-title">أشدّ ما قيل فيه</div>
                      <div className="harshest-quote">
                        <span className="harshest-text">
                          «{matched.narrator.harshest_grade_ar}»
                        </span>
                        <span className="harshest-source">
                          في {matched.narrator.harshest_source_book ?? "كتب الرجال"}
                        </span>
                      </div>
                      <p className="harshest-note">
                        (الإجماع: {matched.narrator.grade_ar ?? matched.narrator.grade_en ?? "—"})
                      </p>
                    </div>
                  ) : matched.narrator?.grade_ar ? (
                    <div className="harshest-block harshest-clean">
                      <div className="harshest-title">حكم الجرح والتعديل</div>
                      <p className="harshest-clean-note">
                        {matched.narrator.grade_ar}
                      </p>
                    </div>
                  ) : null}

                  {/* Disambiguation status + "change narrator" trigger */}
                  <div className="disambig-block">
                    <div className="disambig-head">
                      <span className="disambig-title">اختيار الراوي</span>
                      <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                        {userCorrected
                          ? "اختيارك"
                          : `مطابقة آلية (${CONFIDENCE_AR[matched.confidence ?? ""] ?? "—"})`}
                      </span>
                      <button
                        type="button"
                        className="ghost-btn ghost-btn-sm"
                        onClick={() => setPicking(true)}
                      >
                        تغيير الراوي (مُحتمَل)
                      </button>
                    </div>
                  </div>

                  {matched.narrator && (matched.narrator.top_teachers.length > 0 || matched.narrator.top_students.length > 0) && (
                    <ShuyukhTalamidhBlock
                      teachers={matched.narrator.top_teachers}
                      students={matched.narrator.top_students}
                    />
                  )}

                  {detail.disagreement.distinctGrades >= 2 && (
                    <DisagreementCallout d={detail.disagreement} />
                  )}

                  {detail.sortedSourceGrades.length > 0 && (
                    <SourceGradesTable rows={detail.sortedSourceGrades} />
                  )}

                  {detail.nameVariants.length > 0 && (
                    <details style={{ marginTop: 14, fontSize: 12.5, color: "var(--ink-3)" }}>
                      <summary style={{ cursor: "pointer" }}>
                        صور الاسم ({detail.nameVariants.length})
                      </summary>
                      <ul style={{ marginTop: 6, paddingInlineStart: 16 }}>
                        {detail.nameVariants.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
              {!loading && !detail && (
                <p style={{ color: "var(--red-fg)" }}>تعذّر تحميل بيانات هذا الراوي.</p>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/* ---------- the vertical link between two consecutive narrators ---------- */

/** Phase 4: Top شيوخ + تلامذة list, sourced from Itqan's transmission graph.
 *  Lets the reader verify our "did they meet" claim by inspecting both lists
 *  themselves. Source-book citations show which classical books document each. */
function ShuyukhTalamidhBlock({
  teachers,
  students,
}: {
  teachers: NarratorMiniRef[];
  students: NarratorMiniRef[];
}) {
  return (
    <div className="shuyukh-talamidh">
      {teachers.length > 0 && (
        <ShuyukhList
          title="أبرز شيوخه"
          subtitle={`(${teachers.length} مذكورون)`}
          items={teachers}
        />
      )}
      {students.length > 0 && (
        <ShuyukhList
          title="أبرز تلامذته"
          subtitle={`(${students.length} مذكورون)`}
          items={students}
        />
      )}
    </div>
  );
}

function ShuyukhList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: NarratorMiniRef[];
}) {
  return (
    <details className="shuyukh-block">
      <summary className="shuyukh-head">
        <span className="shuyukh-title">{title}</span>
        <span className="shuyukh-count">{subtitle}</span>
      </summary>
      <ul className="shuyukh-list">
        {items.map((r) => (
          <li key={r.id} className="shuyukh-item">
            <span className="shuyukh-name">{shortenName(r.full_name)}</span>
            {r.death && (
              <span className="shuyukh-death"> · ت {r.death}</span>
            )}
            {r.grade_ar && (
              <span className="shuyukh-grade"> · {r.grade_ar}</span>
            )}
            {r.source_books.length > 0 && (
              <span className="shuyukh-sources">
                {" "}— موثَّق في {r.source_books.slice(0, 2).map((b) => sourceBookAr(b)).join("، ")}
                {r.source_books.length > 2 && ` (+${r.source_books.length - 2})`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function shortenName(full: string): string {
  const tokens = full.replace(/[،:]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length >= 3 && (tokens[1] === "بن" || tokens[1] === "بنت")) {
    return `${tokens[0]} ${tokens[1]} ${tokens[2]}`;
  }
  return tokens.slice(0, 4).join(" ");
}

/** A clean Prophet ﷺ → Companion link strip. Drops chronology + tadlīs +
 *  shawāhid checks (all inapplicable: ا لصحابة كلّهم عدول). */
function ProphetLink() {
  return (
    <div dir="rtl" className="relative my-1 flex items-start">
      <div className="flex w-14 justify-center pt-1">
        <div className="h-12 w-1 rounded-full bg-emerald-700" />
      </div>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold bg-emerald-800 text-white">
        ✓✓
      </div>
      <div className="ms-2 flex-1">
        <p className="text-xs text-emerald-900">
          اتصال صحبة — الصحابيُّ سمع من النبي ﷺ مباشرةً (الصحابة كلّهم عدول).
        </p>
      </div>
    </div>
  );
}

const VERB_LABEL_AR_UI: Record<string, string> = {
  samaa: "✓✓ صرَّح بالسماع",
  liqa: "✓ ثبت اللقاء",
  idraka: "○ أدركه (دون لقاء مُثبت)",
  rawa: "○ روى عنه",
  kataba: "✉ كاتبه",
};

// `attested` = explicit teacher-student edge in Itqan's transmission table
// (extracted from the rijāl literature). It's stronger evidence than mere
// chronological possibility — render it more prominently.
const LINK_STYLE: Record<
  ChainLink["status"],
  { line: string; badge: string; symbol: string }
> = {
  attested: {
    line: "bg-emerald-700",
    badge: "bg-emerald-800 text-white",
    symbol: "✓✓",
  },
  possible: {
    line: "bg-emerald-500",
    badge: "bg-emerald-600 text-white",
    symbol: "✓",
  },
  impossible: {
    line: "bg-red-600",
    badge: "bg-red-700 text-white",
    symbol: "✗",
  },
  unknown: {
    line: "bg-gray-300",
    badge: "bg-gray-300 text-gray-700",
    symbol: "؟",
  },
};

/** Small inline card for the disagreement callout — shows the grade phrase,
 *  the book, and the verified glossary explanation underneath. */
function DisagreementCard({
  label,
  row,
  tone,
}: {
  label: string;
  row: SourceGrade;
  tone: "emerald" | "orange";
}) {
  const term = lookupJarhTerm(row.grade_ar);
  const styles =
    tone === "emerald"
      ? {
          box: "border-emerald-200 bg-emerald-50/60",
          label: "text-emerald-900",
          body: "text-emerald-900",
          sub: "text-emerald-800",
        }
      : {
          box: "border-orange-200 bg-orange-50/60",
          label: "text-orange-900",
          body: "text-orange-900",
          sub: "text-orange-800",
        };
  return (
    <div className={`rounded border p-2 ${styles.box}`}>
      <p className={`text-[10px] font-medium ${styles.label}`}>{label}</p>
      <p className={`font-bold ${styles.body}`}>
        «{row.grade_ar ?? row.grade_en}»
      </p>
      <p className={`text-[10px] ${styles.sub}`}>
        في {sourceBookAr(row.source_book)}
      </p>
      {term && (
        <details className="mt-1.5">
          <summary
            className={`cursor-pointer text-[10px] font-medium ${styles.sub}`}
          >
            معنى المصطلح ▾
          </summary>
          <div className={`mt-1 text-[11px] leading-relaxed ${styles.body}`}>
            <p className="font-medium">{tierLabel(term)}</p>
            <p>{term.explanation}</p>
            {term.caveat && (
              <p className="mt-1 rounded bg-amber-100 p-1 text-amber-900">
                ⚠ {term.caveat}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------- per-book grade table (replaces the cramped 2-col grid) ---------- */

function SourceGradesTable({ rows }: { rows: SourceGrade[] }) {
  // Show EVERY rijal book in the same fixed order for every narrator.
  // 2-col grid on desktop (rijal-table from prototype), 1-col on mobile.
  const byBook = new Map<string, SourceGrade>();
  for (const r of rows) byBook.set(r.source_book, r);

  return (
    <div className="rijal-table-wrap">
      <div className="rijal-table-head">
        <span className="rt-title">حكم كل كتاب من كتب الرجال — {ALL_RIJAL_BOOKS.length} مصدراً</span>
        <span className="rt-legend">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="rt-rail rt-rail-tadil" /> تعديل
          </span>
          <span style={{ marginInlineStart: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="rt-rail rt-rail-jarh" /> جرح
          </span>
        </span>
      </div>
      <ol className="rijal-table">
        {ALL_RIJAL_BOOKS.map((meta, i) => {
          const g = byBook.get(meta.key);
          const railCls =
            meta.orientation === "jarh_leaning"
              ? "rt-rail-jarh"
              : meta.orientation === "tadil_leaning"
                ? "rt-rail-tadil"
                : "rt-rail-other";
          const mention = g ? isMentionOnly(g.grade_ar) : false;
          const style = g ? gradeStyle(g.grade_en) : null;
          const term = g ? lookupJarhTerm(g.grade_ar) : null;
          const termTip = term
            ? `${tierLabel(term)} — ${term.explanation}${term.caveat ? `\n\nملاحظة: ${term.caveat}` : ""}`
            : undefined;
          return (
            <li
              key={meta.key}
              className="rijal-row"
              style={!g ? { opacity: 0.5 } : undefined}
            >
              <span className="rt-idx mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="rt-book" title={meta.noteAr}>
                <span className={`rt-rail ${railCls}`} style={{ display: "inline-block", marginInlineEnd: 6 }} />
                {meta.titleAr}
              </span>
              <span className="rt-grade">
                {!g ? (
                  <span style={{ color: "var(--ink-3)" }}>—</span>
                ) : mention ? (
                  <span className="pill pill-sm pill-neutral">مذكور فقط</span>
                ) : g.grade_ar ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${style!.className}`}
                      title={termTip}
                    >
                      {g.grade_ar}
                    </span>
                    {term && (
                      <span
                        style={{ cursor: "help", fontSize: 10, color: "var(--ink-3)" }}
                        title={termTip}
                        aria-label="شرح المصطلح"
                      >
                        ⓘ
                      </span>
                    )}
                  </span>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>—</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- mudallisīn flag (Ibn Hajar's Tabaqat al-Mudallisin) ---------- */

// Detailed per-tier explanation surfaced in the click-to-expand popover so
// users immediately understand what مX actually means in classical methodology,
// without having to leave the page.
const TADLIS_TIER_INFO: Record<
  number,
  { headline: string; ruling: string; example: string }
> = {
  1: {
    headline: "المرتبة الأولى — تدليس نادر",
    ruling:
      "تُقبَل عنعنته ولا تُعَدّ مَطعنًا في الحديث (لا يُشترَط التصريح بالسماع).",
    example: "مثاله: يحيى بن سعيد الأنصاري، أبو نعيم الأصبهاني.",
  },
  2: {
    headline: "المرتبة الثانية — احتمل الأئمة تدليسه",
    ruling:
      "تُقبَل عنعنته؛ أخرج له البخاري ومسلم في صحيحَيهما لإمامته وقلَّة تدليسه، أو لأنه لا يدلِّس إلا عن ثقة.",
    example: "مثاله: سفيان الثوري، سفيان بن عيينة.",
  },
  3: {
    headline: "المرتبة الثالثة — أكثَر من التدليس",
    ruling:
      "لا تُقبَل عنعنته إلا إذا صرَّح بالسماع («حدثنا» / «سمعت»). عنعنته ضعيفة.",
    example: "مثاله: الأعمش، أبو الزبير المكي، الحسن البصري، قتادة.",
  },
  4: {
    headline: "المرتبة الرابعة — اتفقوا على ردّ عنعنته",
    ruling:
      "تُرَدّ روايته إلا إذا صرَّح بالسماع. وهؤلاء يدلِّسون عن الضعفاء والمتروكين.",
    example: "مثاله: بقية بن الوليد، الوليد بن مسلم.",
  },
  5: {
    headline: "المرتبة الخامسة — ضعفٌ آخر مع التدليس",
    ruling:
      "يُرَدّ حديثه حتى مع تصريحه بالسماع، بسبب ضعفٍ آخر فيه غير التدليس.",
    example: "مثاله: عبد الله بن لهيعة.",
  },
};

function TadlisBadge({ tier }: { tier: number }) {
  const info = TADLIS_TIER_INFO[tier];
  // Color = severity: م1-م2 are merely informational, م3 is the threshold,
  // م4-م5 break the chain.
  const cls =
    tier >= 4
      ? "bg-red-100 text-red-900 border-red-300"
      : tier === 3
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : "bg-gray-100 text-gray-800 border-gray-300";
  // Hover tooltip — full classical ruling without needing to click.
  const tooltip = info
    ? `${info.headline}\n\n${info.ruling}\n\n${info.example}`
    : "مدلِّس";
  return (
    <span className="relative inline-block">
      <details className="group inline-block">
        <summary
          className={`inline-flex cursor-help list-none items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}
          title={tooltip}
        >
          <span>🚩 تدليس م{tier}</span>
          <span aria-hidden className="text-[10px] opacity-70">
            ⓘ
          </span>
        </summary>
        {/* Click-to-open detailed card — for users who want the full
            classical explanation in-place. */}
        {info && (
          <div
            className={`absolute end-0 top-full z-10 mt-1 w-72 rounded-lg border ${cls} p-3 text-xs leading-relaxed shadow-lg`}
            dir="rtl"
          >
            <p className="font-bold">{info.headline}</p>
            <p className="mt-1">{info.ruling}</p>
            <p className="mt-1 text-[11px] opacity-80">{info.example}</p>
            <p className="mt-2 border-t border-current/20 pt-1 text-[10px] opacity-70">
              تصنيف ابن حجر العسقلاني — «تعريف أهل التقديس بمراتب الموصوفين بالتدليس»
            </p>
          </div>
        )}
      </details>
    </span>
  );
}

/* ---------- per-narrator rijāl-source verdicts (22 books) -------------- */

function SourceVerdictsBadge({
  verdicts,
}: {
  verdicts: NonNullable<MatchedNarrator["narrator"]>["source_verdicts"];
}) {
  // Group by source_book key.
  const byBook = new Map<string, typeof verdicts>();
  for (const v of verdicts) {
    const arr = byBook.get(v.source_book) ?? [];
    arr.push(v);
    byBook.set(v.source_book, arr);
  }

  // We display EVERY rijāl book in the same fixed order for every narrator,
  // with "—" placeholder rows for books with no verdict on this narrator.
  // This gives a stable scan-friendly layout — users see at a glance which
  // books are silent on a narrator vs which deliver a verdict.
  const filledCount = byBook.size;

  return (
    <details className="group inline-block">
      <summary
        className="inline-flex cursor-help list-none items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-900"
        title={`${filledCount} كتاب فيه قول، من أصل ${ALL_RIJAL_BOOKS.length} كتاب رجال`}
      >
        <span>
          📜 {filledCount} / {ALL_RIJAL_BOOKS.length} كتب رجال
        </span>
        <span aria-hidden className="text-[10px] opacity-70">
          ⓘ
        </span>
      </summary>
      <div
        className="absolute end-0 z-20 mt-1 w-96 max-w-[28rem] max-h-[28rem] overflow-y-auto rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-950 shadow-lg"
        dir="rtl"
      >
        {ALL_RIJAL_BOOKS.map((meta) => {
          const list = byBook.get(meta.key) ?? [];
          const empty = list.length === 0;
          return (
            <div
              key={meta.key}
              className={`mb-2 border-b border-emerald-300/30 pb-1.5 last:mb-0 last:border-b-0 last:pb-0 ${empty ? "opacity-40" : ""}`}
            >
              <p className="font-bold">
                «{meta.titleAr}» — {meta.authorAr}
                {meta.authorDeath && (
                  <span className="text-[10px] font-normal opacity-70">
                    {" "}
                    (ت {meta.authorDeath})
                  </span>
                )}
              </p>
              {empty ? (
                <p className="mt-0.5 text-[11px]">—</p>
              ) : (
                list.map((v, i) => (
                  <div key={i} className="mt-1">
                    {v.author_ar && (
                      <span className="font-semibold">قال {v.author_ar}: </span>
                    )}
                    <span>{v.verdict_ar}</span>
                    {(v.relayed_via || v.page_ref) && (
                      <span className="ms-2 text-[10px] opacity-70">
                        {v.relayed_via && <>رواية {v.relayed_via} </>}
                        {v.page_ref && <>ص {v.page_ref}</>}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/* ---------- per-narrator cross-book grade-disagreement summary ---------- */

function DisagreementCallout({ d }: { d: DisagreementSummary }) {
  if (!d.highest || !d.lowest) return null;
  // tierSpread ≥ 3 is dramatic (e.g. ثقة → ضعيف). tierSpread = 0 means same
  // bucket, different wording — not really disagreement, suppress callout.
  if (d.tierSpread === 0) return null;
  const severity =
    d.tierSpread >= 3
      ? { box: "border-red-400 bg-red-50", header: "text-red-900" }
      : d.tierSpread === 2
        ? { box: "border-amber-400 bg-amber-50", header: "text-amber-900" }
        : { box: "border-gray-300 bg-gray-50", header: "text-gray-900" };
  const severityLabel =
    d.tierSpread >= 3
      ? "خلاف شديد"
      : d.tierSpread === 2
        ? "خلاف ملحوظ"
        : "خلاف بسيط";
  return (
    <div
      className={`rounded-lg border ${severity.box} p-2.5 text-xs leading-relaxed`}
      dir="rtl"
    >
      <p className={`mb-2 flex items-center gap-2 font-bold ${severity.header}`}>
        <span>⚖</span>
        <span>
          اختلف فيه العلماء — {severityLabel} (فجوة {d.tierSpread} مراتب)
        </span>
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <DisagreementCard
          label="أعلى توثيقًا"
          row={d.highest}
          tone="emerald"
        />
        <DisagreementCard
          label="أشدّ تضعيفًا"
          row={d.lowest}
          tone="orange"
        />
      </div>
    </div>
  );
}

/* ---------- the vertical link between two consecutive narrators ---------- */

function LinkConnector({ link }: { link?: ChainLink }) {
  if (!link) return null;
  const style = LINK_STYLE[link.status];
  const co = link.cooccurrence;
  const formulaLabel =
    link.formula != null ? FORMULA_LABEL_AR[link.formula] : null;
  return (
    <div dir="rtl" className="relative my-1 flex items-start" title={link.reason}>
      <div className="flex w-14 justify-center pt-1">
        <div className={`h-12 w-1 rounded-full ${style.line}`} />
      </div>
      <div
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.badge}`}
        aria-label={link.reason}
      >
        {style.symbol}
      </div>
      <div className="ms-2 flex-1">
        <p className="text-xs text-gray-700">{link.reason}</p>
        {link.attestation_verb && (
          <p className="text-[11px] mt-0.5">
            <span className="font-semibold text-emerald-900">
              {VERB_LABEL_AR_UI[link.attestation_verb.verb]}
            </span>
            <span className="text-gray-700">
              {" "}— من «{sourceBookAr(link.attestation_verb.source_book)}»
              {link.attestation_verb.phrase_ar && `: «${link.attestation_verb.phrase_ar}»`}
            </span>
          </p>
        )}
        {link.documented_non_meeting && (
          <p className="text-[11px] mt-0.5 text-red-800">
            ✗ منع اللقاء: «{link.documented_non_meeting.phrase_ar}» — من «
            {sourceBookAr(link.documented_non_meeting.source_book)}».
          </p>
        )}
        {formulaLabel && (
          <p className="text-[11px]">
            <span className="text-gray-700">صيغة الأداء: </span>
            <span
              className={`font-medium ${
                link.formulaStrength === "explicit"
                  ? "text-emerald-800"
                  : link.formulaStrength === "ambiguous"
                    ? "text-amber-800"
                    : "text-gray-700"
              }`}
            >
              «{formulaLabel}»
              {link.formulaStrength === "explicit"
                ? " — تصريح بالسماع"
                : link.formulaStrength === "ambiguous"
                  ? " — معنعن (محتملة التدليس)"
                  : ""}
            </span>
          </p>
        )}
        {co && co.total > 0 && (
          <details className="mt-0.5">
            <summary className="cursor-pointer text-[11px] text-gray-700">
              <span className="font-medium text-emerald-800">
                وردت هذه الصلة في {co.total} حديث
              </span>{" "}
              من كتب الحديث المُستوردة
            </summary>
            <ul className="mt-0.5 ms-3 list-disc text-[11px] text-gray-700">
              {co.books.slice(0, 5).map((b) => (
                <li key={b.book_id}>
                  {b.book_name_ar}{" "}
                  <span className="text-gray-600">({b.count})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {co && co.total === 0 && (
          <p className="text-[11px] text-amber-800">
            لم نعثر على شواهد لهذه الصلة في كتب الحديث المُستوردة.
          </p>
        )}
        {link.geo?.status === "overlap" && (
          <p className="text-[11px] text-emerald-800">
            🗺 جغرافيًا: التقيا في {link.geo.shared.join("، ")}.
          </p>
        )}
        {link.geo?.status === "no_overlap" && (
          <p className="text-[11px] text-amber-800">
            🗺 لم نعثر على مدنٍ مشتركة في إقاماتهما المُسجَّلة (إشارة ضعيفة فقط).
          </p>
        )}
      </div>
    </div>
  );
}

