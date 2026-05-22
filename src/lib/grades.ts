// Maps Itqan's grade buckets to the Arabic term and a badge style.
// "unknown" is shown as "غير معروف الحال" — not an accusation.

export interface GradeStyle {
  label: string;
  className: string;
}

const GRADES: Record<string, GradeStyle> = {
  companion: { label: "صحابي", className: "bg-purple-100 text-purple-800" },
  reliable: { label: "ثقة", className: "bg-green-100 text-green-800" },
  mostly_reliable: { label: "صدوق", className: "bg-emerald-100 text-emerald-800" },
  weak: { label: "ضعيف", className: "bg-orange-100 text-orange-800" },
  abandoned: { label: "متروك", className: "bg-red-100 text-red-800" },
  fabricator: { label: "متهم بالكذب", className: "bg-red-200 text-red-900" },
  unknown: { label: "غير معروف الحال", className: "bg-gray-100 text-gray-700" },
};

const FALLBACK: GradeStyle = {
  label: "غير معروف الحال",
  className: "bg-gray-100 text-gray-700",
};

export function gradeStyle(gradeEn: string | null): GradeStyle {
  return GRADES[gradeEn ?? ""] ?? FALLBACK;
}
