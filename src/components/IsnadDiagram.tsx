"use client";

import { Fragment, useEffect, useState } from "react";
import type {
  ChainLink,
  MatchedNarrator,
} from "@/lib/match/matcher";
import type {
  DisagreementSummary,
  NarratorDetail,
  SourceGrade,
} from "@/lib/narrator";
import { isMentionOnly } from "@/lib/narrator-helpers";
import { sourceBookAr, sourceBookMeta } from "@/lib/sources";
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
 *  Companions (who are عدول by consensus). */
function effectiveGradeEn(
  gradeEn: string | null | undefined,
  tabaqat: string | null | undefined,
  gradeAr: string | null | undefined,
  harshestGradeEn?: string | null,
): string {
  const t = tabaqat ?? "";
  const g = gradeAr ?? "";
  if (/صحاب|صحبة|له\s+رؤية/.test(t) || /صحاب|صحبة|له\s+صحبة/.test(g)) {
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
 *  connected by chronologically-aware link lines. Click a node to expand. */
export function IsnadDiagram({
  narrators,
  links,
}: {
  narrators: MatchedNarrator[];
  links: ChainLink[];
}) {
  // Pasted order is compiler-first; display order is source-first (the
  // Prophet at the top, transmission flowing down to the compiler's teacher).
  const reversed = [...narrators].reverse();

  return (
    <div className="flex flex-col">
      {reversed.map((n, displayIdx) => {
        const below = reversed[displayIdx + 1];
        const link = below
          ? links.find(
              (l) =>
                l.from_position === below.position &&
                l.to_position === n.position,
            )
          : undefined;
        return (
          <Fragment key={n.position}>
            <NarratorRow matched={n} displayNumber={displayIdx + 1} />
            {below && <LinkConnector link={link} />}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ---------- one narrator: header + expandable body ---------- */

function NarratorRow({
  matched,
  displayNumber,
}: {
  matched: MatchedNarrator;
  displayNumber: number;
}) {
  // The Prophet ﷺ — special render: no expand, no fetch, no candidates.
  if (matched.is_source) {
    return (
      <div dir="rtl" className="flex items-center gap-3 p-2">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-md ${diskBg("prophet")}`}
        >
          {displayNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-gray-900">
            {matched.narrator?.full_name}
          </div>
          <div className="text-sm text-gray-700">المصدر — توفي 11 هـ</div>
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

  return (
    <div dir="rtl" className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-3 rounded-xl border border-transparent p-2 text-start hover:border-gray-300"
      >
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-sm ${diskBg(grade)}`}
          title={gradeLabel(grade)}
        >
          {displayNumber}
        </div>

        <div className="min-w-0 flex-1">
          {/* Line 1: short canonical name. Full nasab is on hover + in expanded panel. */}
          <div
            className="truncate text-lg font-bold text-gray-900"
            title={fullName}
          >
            {compactName}
          </div>
          {/* Line 2: compact metadata chips — easy to scan left-to-right (RTL: right-to-left). */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${gradeBadge.className}`}
              title={
                matched.narrator?.harshest_grade_en &&
                matched.narrator.harshest_grade_en !==
                  matched.narrator.grade_en
                  ? `أشدّ نقدٍ ورد: «${matched.narrator.harshest_grade_ar}» في ${
                      matched.narrator.harshest_source_book ?? "كتب الرجال"
                    } (والإجماع: ${matched.narrator.grade_ar ?? matched.narrator.grade_en ?? "—"})`
                  : undefined
              }
            >
              {gradeLabel(grade)}
              {matched.narrator?.harshest_grade_en &&
                matched.narrator.harshest_grade_en !==
                  matched.narrator.grade_en && (
                  <span className="ms-1 text-[10px] opacity-70">⚖</span>
                )}
            </span>
            {deathInfo && (
              <span
                className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-800"
                title={
                  deathInfo.hasAlternatives && matched.narrator?.death
                    ? `الوفاة المسجَّلة: ${matched.narrator.death}`
                    : undefined
                }
              >
                ت {deathInfo.year}
                {deathInfo.hasAlternatives && (
                  <span className="ms-1 text-[10px] text-gray-600">~</span>
                )}
              </span>
            )}
            {tabaqat && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-800">
                {tabaqat}
              </span>
            )}
            {matched.narrator?.tadlis_tier != null && (
              <TadlisBadge tier={matched.narrator.tadlis_tier} />
            )}
            {matched.status === "needs_review" && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                بحاجة إلى مراجعة
              </span>
            )}
            {matched.status === "not_found" && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800">
                لم يُعرَف
              </span>
            )}
          </div>
        </div>

        <span aria-hidden className="text-2xl text-gray-600">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="mb-2 ms-16 rounded-lg bg-gray-50 p-3 text-sm text-gray-900">
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
              {loading && <p className="text-gray-500">جارٍ التحميل…</p>}
              {!loading && detail && (
                <div className="space-y-3">
                  <div className="rounded border border-gray-200 bg-white p-2 text-xs">
                    <p className="font-bold text-gray-900">{detail.full_name}</p>
                    {matched.narrator?.death &&
                      matched.narrator.death !== "-" && (
                        <p className="mt-1 text-gray-700">
                          <span className="text-gray-600">الوفاة المسجَّلة:</span>{" "}
                          {matched.narrator.death}
                        </p>
                      )}
                    {detail.kunya && (
                      <p className="mt-0.5 text-gray-700">
                        <span className="text-gray-600">الكنية:</span>{" "}
                        {detail.kunya}
                      </p>
                    )}
                    {detail.laqab && (
                      <p className="mt-0.5 text-gray-700">
                        <span className="text-gray-600">اللقب:</span>{" "}
                        {detail.laqab}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-gray-700">
                    {userCorrected
                      ? "اختيارك"
                      : `مطابقة آلية (${
                          CONFIDENCE_AR[matched.confidence ?? ""] ?? "—"
                        })`}{" "}
                    ·{" "}
                    <button
                      type="button"
                      onClick={() => setPicking(true)}
                      className="text-emerald-700 underline"
                    >
                      غيّر الراوي
                    </button>
                  </div>

                  {detail.disagreement.distinctGrades >= 2 && (
                    <DisagreementCallout d={detail.disagreement} />
                  )}

                  {detail.sortedSourceGrades.length > 0 && (
                    <SourceGradesTable rows={detail.sortedSourceGrades} />
                  )}

                  {detail.nameVariants.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600">
                        صور الاسم ({detail.nameVariants.length})
                      </summary>
                      <ul className="mt-1 space-y-0.5">
                        {detail.nameVariants.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              {!loading && !detail && (
                <p className="text-red-700">تعذّر تحميل بيانات هذا الراوي.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- the vertical link between two consecutive narrators ---------- */

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
  // Group by orientation so the reader can see "all jarh books said X,
  // all tadil books said Y" at a glance.
  return (
    <div>
      <p className="mb-1 font-bold text-gray-900">التصنيف في كل كتاب</p>
      <p className="mb-2 text-[10px] text-gray-600">
        مرتَّبة من الأعلى ثناءً إلى الأقسى نقداً. الكتب البرتقاليّة كتب جرحٍ،
        والخضراء كتب تعديلٍ.
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((g, i) => {
            const meta = sourceBookMeta(g.source_book);
            const tint =
              meta?.orientation === "jarh_leaning"
                ? "border-r-2 border-orange-400 bg-orange-50/40"
                : meta?.orientation === "tadil_leaning"
                  ? "border-r-2 border-emerald-400 bg-emerald-50/40"
                  : "border-r-2 border-gray-200";
            const mention = isMentionOnly(g.grade_ar);
            const style = gradeStyle(g.grade_en);
            const term = lookupJarhTerm(g.grade_ar);
            const termTip = term
              ? `${tierLabel(term)} — ${term.explanation}${term.caveat ? `\n\nملاحظة: ${term.caveat}` : ""}`
              : undefined;
            return (
              <tr key={i} className="border-t border-gray-100">
                <td
                  className={`whitespace-nowrap p-1.5 pe-2 font-medium text-gray-900 ${tint}`}
                  title={meta?.noteAr ?? ""}
                >
                  {sourceBookAr(g.source_book)}
                </td>
                <td className="p-1.5 ps-2 text-gray-900">
                  {mention ? (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
                      مذكور فقط
                    </span>
                  ) : g.grade_ar ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${style.className}`}
                        title={termTip}
                      >
                        {g.grade_ar}
                      </span>
                      {term && (
                        <span
                          className="cursor-help text-[10px] text-gray-500"
                          title={termTip}
                          aria-label="شرح المصطلح"
                        >
                          ⓘ
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- mudallisīn flag (Ibn Hajar's Tabaqat al-Mudallisin) ---------- */

const TADLIS_LABEL_AR: Record<number, string> = {
  1: "مدلِّس (المرتبة الأولى)",
  2: "مدلِّس (المرتبة الثانية)",
  3: "مدلِّس (المرتبة الثالثة) — تُقبل عنعنته بشرط التصريح بالسماع",
  4: "مدلِّس (المرتبة الرابعة) — تُرَدّ عنعنته",
  5: "مدلِّس (المرتبة الخامسة) — يُرَدّ حديثه لضعفٍ آخر",
};

function TadlisBadge({ tier }: { tier: number }) {
  // Tiers 1-2 are mild; 3+ is a real chain-validity concern.
  const cls =
    tier >= 4
      ? "bg-red-100 text-red-900 border-red-300"
      : tier === 3
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : "bg-gray-100 text-gray-800 border-gray-300";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}
      title={TADLIS_LABEL_AR[tier] ?? "مدلِّس"}
    >
      🚩 تدليس م{tier}
    </span>
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
