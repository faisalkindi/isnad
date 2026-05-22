import type { ChainLink, MatchedNarrator } from "@/lib/match/matcher";

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

const LINK_STYLE: Record<
  ChainLink["status"],
  { symbol: string; className: string }
> = {
  possible: { symbol: "←", className: "text-emerald-700" },
  impossible: { symbol: "✗", className: "text-red-700 font-bold text-lg" },
  unknown: { symbol: "←", className: "text-gray-400" },
};

/**
 * The pasted chain drawn as a row of narrator nodes (RTL). Each link between
 * consecutive nodes is annotated with its chronological status.
 */
export function ChainView({
  narrators,
  links,
  onSelect,
}: {
  narrators: MatchedNarrator[];
  links: ChainLink[];
  onSelect: (position: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {narrators.map((n, i) => {
        const link = links.find((l) => l.from_position === i);
        const style = link && LINK_STYLE[link.status];
        return (
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
            {i < narrators.length - 1 && style && (
              <span
                className={style.className}
                title={link?.reason}
                aria-label={link?.reason}
              >
                {style.symbol}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
