"use client";

import { useState } from "react";
import type {
  ChainVerdict,
  HadithMatch,
  MatchResult,
  NisbahResult,
  NisbahType,
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

function NisbahBadge({ nisbah }: { nisbah: NisbahResult }) {
  const s = NISBAH_STYLE[nisbah.type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium ${s.className}`}
      title={nisbah.reason}
    >
      <span aria-hidden>{s.symbol}</span>
      <span>{nisbah.label}</span>
    </span>
  );
}

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
      <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
        <strong>سياسة التطبيق في الحكم على الراوي:</strong>{" "}
        نأخذ <strong>بأشدّ الجرح</strong> الموجود في كتب الرجال الـ22 (على
        قاعدة «الجرح المفسَّر مقدَّم على التعديل»)، ما لم يكن الراوي صحابيًّا —
        فإن الصحابة كلّهم عدول بالإجماع. هذا أحوط ما يمكن الحكم به، وقد يكون
        أشدّ مما يأخذ به بعض العلماء.
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
          🧮 {v.label}
        </span>
        <span
          className="cursor-help text-[10px] text-gray-500"
          title="حكم تطبيقنا على نفس هذا السند، تطبيقاً لقاعدة «أشدّ الجرح» على كل راوٍ."
        >
          ⓘ
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
      title="انقر لتفحَص التطبيقُ سند هذه الرواية ويُظهر حكمه."
    >
      🧮 احسب حكم التطبيق
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

  return (
    <div className="rounded-xl border border-gray-300 bg-white p-4" dir="rtl">
      <h2 className="mb-2 text-sm font-bold text-gray-800">
        ورد هذا الحديث في {matches.length} موضع
      </h2>
      {chainTooShort && matches.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          <p className="font-bold">
            💡 ما لصقتَه يحوي المتن دون السلسلة الكاملة.
          </p>
          <p className="mt-1">
            اضغط على «افحص بالسلسلة الكاملة» بجانب أي كتاب أدناه ليُعاد الفحص
            باستخدام السند المسجَّل في ذلك الكتاب.
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {matches.map((m) => {
          const badge = gradeBadge(m.grade);
          return (
            <li key={m.id} className="rounded-lg border border-gray-200">
              <details open={chainTooShort && matches[0].id === m.id}>
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
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span
                        className="cursor-help rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] font-medium text-gray-700"
                        title={
                          "هذا حكم المصنِّف أو المحقِّق على هذه الرواية في هذا الكتاب — " +
                          "وليس حكم تطبيقنا. مثال: صحيح البخاري ومسلم ⇐ حكم المؤلِّف ذاته بإدخاله في صحيحه. " +
                          "السنن والمسانيد ⇐ في الغالب حكم محقِّقٍ متأخّر (كالألباني أو شعيب الأرنؤوط)."
                        }
                      >
                        📖 حكم الكتاب
                      </span>
                    </span>
                  )}
                  {/* App verdict — lazily computed per match. Shows the comparison the user asked for. */}
                  <AppVerdictTag
                    state={appVerdicts[m.id]}
                    onCompute={(e) => {
                      e.preventDefault();
                      computeAppVerdict(m);
                    }}
                  />
                  <span className="ms-auto text-xs font-medium text-gray-700">
                    {Math.round(m.score * 100)}٪
                  </span>
                </summary>
                <div className="border-t border-gray-200 bg-gray-50">
                  <p className="p-3 text-sm leading-relaxed text-gray-900">
                    {m.arabic_full}
                  </p>
                  <div className="flex justify-end border-t border-gray-200 p-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onAuditFullChain(m.arabic_full);
                      }}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      ⟲ افحص بالسلسلة الكاملة من {m.book_name_ar}
                    </button>
                  </div>
                </div>
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
          onClick={() => audit()}
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

          {/* Corpus matches — flag chain-too-short so user can re-audit using a book's full chain. */}
          {result.corpus_matches.length > 0 && (
            <CorpusMatches
              matches={result.corpus_matches}
              chainTooShort={result.narrators.length <= 2}
              onAuditFullChain={(arabicFull) => audit(arabicFull)}
            />
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
                      {result.nisbah && (
                        <NisbahBadge nisbah={result.nisbah} />
                      )}
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
