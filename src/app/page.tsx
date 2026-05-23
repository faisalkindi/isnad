"use client";

import { useState } from "react";
import type {
  ChainVerdict,
  HadithMatch,
  MatchResult,
} from "@/lib/match/matcher";
import { IsnadDiagram } from "@/components/IsnadDiagram";

const EXAMPLE =
  "حدثنا الحميدي عبد الله بن الزبير، قال: حدثنا سفيان، قال: حدثنا يحيى بن سعيد الأنصاري، قال: أخبرني محمد بن إبراهيم التيمي، أنه سمع علقمة بن وقاص الليثي، يقول: سمعت عمر بن الخطاب رضي الله عنه على المنبر، قال: سمعت رسول الله صلى الله عليه وسلم يقول: إنما الأعمال بالنيات وإنما لكل امرئ ما نوى";

const VERDICT_STYLE: Record<
  ChainVerdict,
  { bg: string; text: string; label: string; symbol: string }
> = {
  sahih_candidate: {
    bg: "bg-green-100 border-green-400",
    text: "text-green-900",
    label: "صحيح بظاهر الإسناد",
    symbol: "✓",
  },
  hasan_candidate: {
    bg: "bg-emerald-100 border-emerald-300",
    text: "text-emerald-900",
    label: "حسن بظاهر الإسناد",
    symbol: "✓",
  },
  daif: {
    bg: "bg-orange-100 border-orange-300",
    text: "text-orange-900",
    label: "ضعيف الإسناد",
    symbol: "✗",
  },
  broken: {
    bg: "bg-red-100 border-red-300",
    text: "text-red-900",
    label: "إسناد منقطع",
    symbol: "✗",
  },
  needs_review: {
    bg: "bg-amber-100 border-amber-300",
    text: "text-amber-900",
    label: "يحتاج إلى مراجعة",
    symbol: "⚠",
  },
};

function RuleFooter() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
      <p className="font-semibold">القاعدة المطبَّقة:</p>
      <p className="mt-1 italic">
        «الحديث الذي اتصل إسناده بنقل العدل الضابط عن العدل الضابط إلى منتهاه،
        ولا يكون شاذاً ولا معلّلًا»
      </p>
      <p className="mt-2">
        يفحص التطبيق <strong>الاتصال</strong> زمنيًّا، و
        <strong>العدالة والضبط</strong> من تصنيف العلماء للرواة. أما{" "}
        <strong>الشذوذ والعلة</strong> فيحتاجان إلى نظر العالم وليسا في طاقة
        التطبيق — لذا قيل: <em>بظاهر الإسناد</em>.
      </p>
    </div>
  );
}

function gradeBadge(grade: string | null): { className: string; label: string } | null {
  if (!grade) return null;
  if (/sahih|صحيح/i.test(grade))
    return { className: "bg-green-100 text-green-800", label: grade };
  if (/hasan|حسن/i.test(grade))
    return { className: "bg-emerald-100 text-emerald-800", label: grade };
  if (/da'?i?f|ضعيف/i.test(grade))
    return { className: "bg-orange-100 text-orange-800", label: grade };
  return { className: "bg-gray-100 text-gray-700", label: grade };
}

function MatnPanel({ matn }: { matn: string }) {
  return (
    <div className="rounded-xl border border-gray-300 bg-white p-4" dir="rtl">
      <h2 className="mb-2 text-sm font-bold text-gray-800">المتن</h2>
      <p className="text-lg font-medium leading-relaxed text-gray-900">{matn}</p>
    </div>
  );
}

function CorpusMatches({ matches }: { matches: HadithMatch[] }) {
  return (
    <div className="rounded-xl border border-gray-300 bg-white p-4" dir="rtl">
      <h2 className="mb-2 text-sm font-bold text-gray-800">
        ورد هذا الحديث في {matches.length} موضع
      </h2>
      <ul className="space-y-2">
        {matches.map((m) => {
          const badge = gradeBadge(m.grade);
          return (
            <li key={m.id} className="rounded-lg border border-gray-200">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-2 hover:bg-gray-50">
                  <span className="font-bold text-gray-900">
                    {m.book_name_ar}
                  </span>
                  {m.hadith_in_book && (
                    <span className="text-sm font-medium text-gray-700">
                      رقم {m.hadith_in_book}
                    </span>
                  )}
                  {badge && (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                  <span className="ms-auto text-xs font-medium text-gray-700">
                    {Math.round(m.score * 100)}٪
                  </span>
                </summary>
                <p className="border-t border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-900">
                  {m.arabic_full}
                </p>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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

  const hasChain = result && result.narrators.length > 0;
  const hasContent =
    result && (result.narrators.length > 0 || result.corpus_matches.length > 0 || result.matn);

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">مدقّق الإسناد</h1>
      <p className="mt-1 text-sm text-gray-700">
        الصق الحديث كاملًا (المتن والإسناد) — سيتعرّف التطبيق على كل راوٍ،
        ويعرض حكم العلماء عليه، ويبحث عن المتن في الكتب التسعة.
      </p>

      <textarea
        dir="rtl"
        value={isnad}
        onChange={(e) => setIsnad(e.target.value)}
        placeholder="… الصق الحديث هنا"
        rows={5}
        className="mt-4 w-full rounded-lg border border-gray-300 p-3 text-lg"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={audit}
          disabled={loading || isnad.trim().length === 0}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-40"
          suppressHydrationWarning
        >
          {loading ? "…جارٍ الفحص" : "افحص الحديث"}
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

      {loading && <p className="mt-6 text-gray-500">…جارٍ تحليل الحديث</p>}

      {result && (
        <section className="mt-8 space-y-4">
          {!hasContent && (
            <p className="text-gray-600">لم يُعثر على إسناد أو حديث.</p>
          )}

          {/* Matn */}
          {result.matn && <MatnPanel matn={result.matn} />}

          {/* Corpus matches */}
          {result.corpus_matches.length > 0 && (
            <CorpusMatches matches={result.corpus_matches} />
          )}

          {/* Isnād verdict + diagram */}
          {hasChain && (
            <>
              {(() => {
                const v = VERDICT_STYLE[result.chain_verdict];
                return (
                  <div className={`rounded-xl border ${v.bg} ${v.text} p-4`}>
                    <div className="flex items-center gap-2 text-lg font-bold">
                      <span aria-hidden>{v.symbol}</span>
                      <span>{v.label}</span>
                    </div>
                    <p className="mt-1 text-sm">{result.chain_reason}</p>
                  </div>
                );
              })()}
              <RuleFooter />

              <div className="rounded-xl border border-gray-300 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-gray-600">
                  السلسلة
                </h2>
                <IsnadDiagram
                  narrators={result.narrators}
                  links={result.links}
                />
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
