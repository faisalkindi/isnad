// Maps Itqan's grade buckets to a plain-English gloss and a badge style.
// "unknown" is presented as "status not established" — not an accusation.

export interface GradeStyle {
  label: string;
  className: string;
}

const GRADES: Record<string, GradeStyle> = {
  companion: { label: "Companion", className: "bg-purple-100 text-purple-800" },
  reliable: { label: "Reliable", className: "bg-green-100 text-green-800" },
  mostly_reliable: {
    label: "Mostly reliable",
    className: "bg-emerald-100 text-emerald-800",
  },
  weak: { label: "Weak", className: "bg-orange-100 text-orange-800" },
  abandoned: {
    label: "Abandoned (matrūk)",
    className: "bg-red-100 text-red-800",
  },
  fabricator: {
    label: "Accused fabricator",
    className: "bg-red-200 text-red-900",
  },
  unknown: {
    label: "Status not established",
    className: "bg-gray-100 text-gray-700",
  },
};

const FALLBACK: GradeStyle = {
  label: "Status not established",
  className: "bg-gray-100 text-gray-700",
};

export function gradeStyle(gradeEn: string | null): GradeStyle {
  return GRADES[gradeEn ?? ""] ?? FALLBACK;
}
