"use client";

import { Fragment, useEffect, useState } from "react";
import type {
  ChainLink,
  MatchedNarrator,
} from "@/lib/match/matcher";
import type { NarratorDetail } from "@/lib/narrator";
import { sourceBookAr } from "@/lib/sources";

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
          <div className="text-lg font-semibold">
            {matched.narrator?.full_name}
          </div>
          <div className="text-sm text-gray-600">المصدر — توفي 11 هـ</div>
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

  const displayedName =
    matched.narrator?.full_name ?? matched.fragment;
  const death = display(matched.narrator?.death);
  const tabaqat = display(matched.narrator?.tabaqat);
  const grade = matched.narrator?.grade_en ?? null;
  const userCorrected = chosenId !== (matched.narrator?.id ?? null);

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
          <div className="truncate text-lg font-semibold">
            {displayedName}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-600">
            <span>{gradeLabel(grade)}</span>
            {death && <span>ت {death}</span>}
            {tabaqat && <span>{tabaqat}</span>}
            {matched.status === "needs_review" && (
              <span className="text-amber-700">بحاجة إلى مراجعة</span>
            )}
            {matched.status === "not_found" && (
              <span className="text-gray-500">لم يُعرَف</span>
            )}
          </div>
        </div>

        <span aria-hidden className="text-2xl text-gray-400">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="mb-2 ms-16 rounded-lg bg-gray-50 p-3 text-sm">
          {(matched.candidates.length > 0 && (picking || chosenId == null)) && (
            <div className="mb-3">
              {chosenId == null && (
                <p className="mb-2 text-gray-700">
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
                  <div className="text-xs text-gray-600">
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

                  {detail.sourceGrades.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium">التصنيف في كل كتاب</p>
                      <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
                        {detail.sourceGrades.map((g, i) => (
                          <li
                            key={i}
                            className="flex justify-between gap-2 text-xs"
                          >
                            <span className="text-gray-500">
                              {sourceBookAr(g.source_book)}
                            </span>
                            <span>
                              {g.grade_ar ?? g.grade_en ?? "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
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

const LINK_STYLE: Record<
  ChainLink["status"],
  { line: string; badge: string; symbol: string }
> = {
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

function LinkConnector({ link }: { link?: ChainLink }) {
  if (!link) return null;
  const style = LINK_STYLE[link.status];
  return (
    <div
      dir="rtl"
      className="relative my-1 flex items-center"
      title={link.reason}
    >
      <div className="flex w-14 justify-center">
        <div className={`h-12 w-1 rounded-full ${style.line}`} />
      </div>
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold ${style.badge}`}
        aria-label={link.reason}
      >
        {style.symbol}
      </div>
      <span className="ms-2 text-xs text-gray-600">{link.reason}</span>
    </div>
  );
}
