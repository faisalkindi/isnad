// Permanent, non-dismissible statement of what this tool does and does not do.
// Required by the design's honest-use principles — there is no close control.
export function LimitsBanner() {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      <strong>أداة مرجعية، وليست حُكمًا — a reference, not a ruling.</strong>{" "}
      It shows what classical scholars recorded about the narrators you provide.
      It cannot detect narrators omitted from a chain, and does not assess
      authenticity (صحة), hidden defects (علل), or anomaly (شذوذ) — that requires
      a qualified scholar.
    </div>
  );
}
