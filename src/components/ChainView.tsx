import type { MatchedNarrator } from "@/lib/match/matcher";

const STATUS_DOT: Record<string, string> = {
  matched: "bg-green-500",
  needs_review: "bg-amber-500",
  not_found: "bg-gray-400",
};

const STATUS_LABEL_AR: Record<string, string> = {
  matched: "تم التعرّف",
  needs_review: "بحاجة إلى مراجعة",
  not_found: "لم يُعرَف",
};

/**
 * The pasted chain drawn as a row of narrator nodes (RTL). Plain DOM, so it is
 * keyboard-navigable and screen-reader friendly with no canvas fallback.
 */
export function ChainView({
  narrators,
  onSelect,
}: {
  narrators: MatchedNarrator[];
  onSelect: (position: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {narrators.map((n, i) => (
        <li key={n.position} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(n.position)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:border-gray-600"
            title={STATUS_LABEL_AR[n.status]}
          >
            <span
              className={`me-2 inline-block h-2 w-2 rounded-full align-middle ${STATUS_DOT[n.status]}`}
              aria-hidden
            />
            <span dir="rtl">{n.narrator?.full_name ?? n.fragment}</span>
            <span className="sr-only"> ({STATUS_LABEL_AR[n.status]})</span>
          </button>
          {i < narrators.length - 1 && (
            <span className="text-gray-400" aria-hidden>
              ←
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
