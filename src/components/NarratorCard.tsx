"use client";

import { useEffect, useState } from "react";
import type { MatchedNarrator } from "@/lib/match/matcher";
import type { NarratorDetail } from "@/lib/narrator";
import { gradeStyle } from "@/lib/grades";

/** Render a field value, treating Itqan's "-" / null as "not recorded". */
function field(value: string | null): string {
  return value && value !== "-" ? value : "not recorded";
}

function GradeBadge({ gradeEn }: { gradeEn: string | null }) {
  const style = gradeStyle(gradeEn);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}

export function NarratorCard({ matched }: { matched: MatchedNarrator }) {
  const [chosenId, setChosenId] = useState<number | null>(
    matched.narrator?.id ?? null,
  );
  const [detail, setDetail] = useState<NarratorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (chosenId == null) {
      setDetail(null);
      return;
    }
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
  }, [chosenId]);

  const userCorrected = chosenId !== (matched.narrator?.id ?? null);

  return (
    <article className="rounded-xl border border-gray-300 bg-white p-4">
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-gray-500">
          Position {matched.position + 1} — pasted as “
          <span dir="rtl">{matched.fragment}</span>”
        </span>
        {chosenId != null && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className="text-xs text-emerald-700 underline"
          >
            {picking ? "close" : "change narrator"}
          </button>
        )}
      </header>

      {/* Identified narrator */}
      {chosenId != null && !picking && (
        <div className="mt-2">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {!loading && detail && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold" dir="rtl">
                  {detail.full_name}
                </h3>
                <GradeBadge gradeEn={detail.grade_en} />
                {detail.grade_ar && (
                  <span className="text-sm text-gray-600" dir="rtl">
                    {detail.grade_ar}
                  </span>
                )}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-gray-500">Generation (ṭabaqa)</dt>
                <dd dir="rtl">{field(detail.tabaqat)}</dd>
                <dt className="text-gray-500">Death</dt>
                <dd dir="rtl">{field(detail.death)}</dd>
                <dt className="text-gray-500">City</dt>
                <dd dir="rtl">{field(detail.city)}</dd>
                <dt className="text-gray-500">Match</dt>
                <dd>
                  {userCorrected
                    ? "your selection"
                    : `auto-matched (${matched.confidence ?? "—"} confidence)`}
                </dd>
              </dl>

              {detail.sourceGrades.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium">
                    Grade by classical text
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {detail.sourceGrades.map((g, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-gray-500">{g.source_book}</span>
                        <span dir="rtl">{g.grade_ar ?? g.grade_en ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.nameVariants.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-gray-600">
                    Name variants ({detail.nameVariants.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5" dir="rtl">
                    {detail.nameVariants.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {!loading && !detail && (
            <p className="text-sm text-red-700">
              Could not load this narrator&apos;s record.
            </p>
          )}
        </div>
      )}

      {/* Picker — shown for unresolved positions or when correcting */}
      {(chosenId == null || picking) && (
        <div className="mt-2">
          {chosenId == null && (
            <p className="text-sm text-gray-600">
              {matched.candidates.length === 0
                ? "This narrator could not be identified in the database."
                : "This match needs review — choose the intended narrator:"}
            </p>
          )}
          {matched.candidates.length > 0 && (
            <ul className="mt-2 space-y-1">
              {matched.candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosenId(c.id);
                      setPicking(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-start hover:border-emerald-500"
                  >
                    <span dir="rtl">{c.full_name}</span>
                    <GradeBadge gradeEn={c.grade_en} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
