// Client-safe formula constants. Lives in its own file so client components
// (e.g., IsnadDiagram) can import without pulling in the Anthropic SDK that
// segment.ts depends on.

export type ReceiveFormula =
  | "haddathana"
  | "haddathani"
  | "akhbarana"
  | "akhbarani"
  | "anbaana"
  | "anbaani"
  | "samitu"
  | "qala-li"
  | "qala-lana"
  | "qala"
  | "an"
  | "anna";

export const FORMULA_LABEL_AR: Record<ReceiveFormula, string> = {
  haddathana: "حدّثنا",
  haddathani: "حدّثني",
  akhbarana: "أخبرنا",
  akhbarani: "أخبرني",
  anbaana: "أنبأنا",
  anbaani: "أنبأني",
  samitu: "سمعتُ",
  "qala-li": "قال لي",
  "qala-lana": "قال لنا",
  qala: "قال",
  an: "عن",
  anna: "أنّ",
};

/** Classify the formula's strength for chain-verification purposes.
 *  - explicit  = clear samāʿ (حدثنا، سمعت، أخبرنا، …)
 *  - ambiguous = muʿan-ʿan (عن، أن، قال) — tadlīs risk
 *  - unknown   = formula not captured */
export function formulaStrength(
  f: ReceiveFormula | null | undefined,
): "explicit" | "ambiguous" | "unknown" {
  if (f == null) return "unknown";
  if (
    f === "haddathana" ||
    f === "haddathani" ||
    f === "akhbarana" ||
    f === "akhbarani" ||
    f === "anbaana" ||
    f === "anbaani" ||
    f === "samitu" ||
    f === "qala-li" ||
    f === "qala-lana"
  ) {
    return "explicit";
  }
  return "ambiguous";
}
