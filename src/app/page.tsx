"use client";

import { useState } from "react";
import type { MatchResult } from "@/lib/match/matcher";
import { ChainView } from "@/components/ChainView";
import { NarratorCard } from "@/components/NarratorCard";

const EXAMPLE = "حدثنا مالك عن نافع عن ابن عمر";

export default function HomePage() {
  const [isnad, setIsnad] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function audit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isnad }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
        return;
      }
      setResult(body as MatchResult);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function scrollToCard(position: number) {
    document
      .getElementById(`narrator-${position}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold" dir="rtl">
        مدقّق الإسناد
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Paste a hadith isnād (chain of narrators). The app identifies each
        narrator and shows what the classical books recorded — it does not rule
        on the hadith.
      </p>

      <textarea
        dir="rtl"
        value={isnad}
        onChange={(e) => setIsnad(e.target.value)}
        placeholder="… الصق الإسناد هنا"
        rows={4}
        className="mt-4 w-full rounded-lg border border-gray-300 p-3 text-lg"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={audit}
          disabled={loading || isnad.trim().length === 0}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-40"
        >
          {loading ? "…جارٍ الفحص" : "افحص الإسناد"}
        </button>
        <button
          type="button"
          onClick={() => setIsnad(EXAMPLE)}
          className="rounded-lg border border-gray-300 px-4 py-2"
        >
          مثال
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {loading && <p className="mt-6 text-gray-500">…جارٍ تحليل السلسلة</p>}

      {result && (
        <section className="mt-8">
          {result.narrators.length === 0 ? (
            <p className="text-gray-600">
              No narrators were found in this text.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-semibold" dir="rtl">
                السلسلة
              </h2>
              <div className="mt-2">
                <ChainView
                  narrators={result.narrators}
                  onSelect={scrollToCard}
                />
              </div>
              <div className="mt-6 space-y-4">
                {result.narrators.map((n) => (
                  <div key={n.position} id={`narrator-${n.position}`}>
                    <NarratorCard matched={n} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
