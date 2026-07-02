import { Operation } from "./tutorConfig";

export type ProgressBand = "solid" | "developing" | "struggling" | "needs-teach";

export interface CoverageGapSummary {
  missingFacts?: string[];
}

const OPERATION_LABELS: Record<Operation, string> = {
  addition: "addition",
  subtraction: "subtraction",
  multiplication: "multiplication",
  division: "division",
};

export function operationLabel(operation: Operation): string {
  return OPERATION_LABELS[operation];
}

export function recommendationFor(
  operation: Operation,
  tierLabel: string,
  band: ProgressBand,
  coverageGap?: CoverageGapSummary | null
): string {
  if (coverageGap?.missingFacts?.length) {
    const facts = coverageGap.missingFacts.slice(0, 5).join(", ");
    return `Almost there — focus the next short set on ${facts}.`;
  }

  if (band === "struggling") {
    return `Replay the ${operationLabel(operation)} lesson for ${tierLabel}, then do a short practice set.`;
  }

  if (band === "developing") {
    return `Keep ${operationLabel(operation)} practice short and regular until it feels automatic.`;
  }

  if (band === "needs-teach") {
    return `Start with the lesson, then try a small practice set right after.`;
  }

  return `Keep going — this skill looks steady right now.`;
}
