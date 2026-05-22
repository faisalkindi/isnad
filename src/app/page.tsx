"use client";

import { useState } from "react";
import type { ChainVerdict, MatchResult } from "@/lib/match/matcher";
import { ChainView } from "@/components/ChainView";
import { NarratorCard } from "@/components/NarratorCard";

const EXAMPLE = "حدثنا مالك عن نافع عن ابن عمر";

const VERDICT_STYLE: Record<
  ChainVerdict,
  { bg: string; text: string; label: string; symbol: string }
> = {
  trustworthy_candidate: {
    bg: "bg-emerald-100 border-emerald-300",
    text: "text-emerald-900",
    label: "سلسلة محتملة الاتصال، رجالها موثَّقون",
    symbol: "✓",
  },
  broken: {
    bg: "bg-red-100 border-red-300",
    text: "text-red-900",
    label: "سلسلة منقطعة",
    symbol: "✗",
  },
  needs_review: {
    bg: "bg-amber-100 border-amber-300",
    text: "text-amber-900",
    label: "السلسلة تحتاج إلى مراجعة",
    symbol: "⚠",
  },
};

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
        setError(body.error ?? "حدث خطأ ما.");
        return;
      }
      setResult(body as MatchResult);
    } catch {
      setError("تعذّر الاتصال بالخادم — حاول مرة أخرى.");
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
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">مدقّق الإسناد</h1>
      <p className="mt-1 text-sm text-gray-600">
        الصق سند حديث — سيتعرّف التطبيق على كل راوٍ، ويعرض حكم العلماء عليه،
        ويختبر الاتصال الزمني بين كل طبقتين.
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
            <p className="text-gray-600">لم يُعثر على رواة في هذا النص.</p>
          ) : (
            <>
              {/* Chain-level verdict */}
              {(() => {
                const v = VERDICT_STYLE[result.chain_verdict];
                return (
                  <div
                    className={`rounded-xl border ${v.bg} ${v.text} p-4`}
                  >
                    <div className="flex items-center gap-2 text-lg font-bold">
                      <span aria-hidden>{v.symbol}</span>
                      <span>{v.label}</span>
                    </div>
                    <p className="mt-1 text-sm">{result.chain_reason}</p>
                  </div>
                );
              })()}

              <h2 className="mt-6 text-lg font-semibold">السلسلة</h2>
              <div className="mt-2">
                <ChainView
                  narrators={result.narrators}
                  links={result.links}
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
