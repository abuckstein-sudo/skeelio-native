import { Operation, LADDERS } from "../tutorConfig";
import { currentTierAndBand, Attempt } from "./ability";

export interface NextStep {
  operation: Operation;
  tierId: string;
  mode: "teach" | "practice";
}

export function pickNextStep(
  child: any,
  attemptsByOperation: Record<Operation, Attempt[]>
): NextStep {
  const operations: Operation[] = ["addition", "subtraction", "multiplication", "division"];

  // For each operation, determine current tier and whether it's solid.
  const progress: Array<{ operation: Operation; tierId: string; isSolid: boolean; tierIndex: number }> = [];

  for (const op of operations) {
    const attempts = attemptsByOperation[op] || [];
    const { tierId, band } = currentTierAndBand(attempts, op, child);
    const ladder = LADDERS[op];
    const tierIndex = ladder.findIndex((t) => t.id === tierId);
    const isSolid = band === "solid";

    progress.push({
      operation: op,
      tierId,
      isSolid,
      tierIndex,
    });
  }

  // Find the lowest tier that is NOT yet solid.
  // Sort by tier index (lowest first), then by whether it's solid (solid tiers last).
  const notSolid = progress.filter((p) => !p.isSolid).sort((a, b) => a.tierIndex - b.tierIndex);

  if (notSolid.length === 0) {
    // All operations solid (unlikely in real usage, but handle it).
    const op = operations[0];
    return {
      operation: op,
      tierId: LADDERS[op][0].id,
      mode: "teach",
    };
  }

  const selected = notSolid[0];
  // Brand-new tier = no attempts at this tier yet at all
  const isNewTier = !attemptsByOperation[selected.operation]?.some((a) => a.tierId === selected.tierId);

  return {
    operation: selected.operation,
    tierId: selected.tierId,
    mode: isNewTier ? "teach" : "practice",
  };
}
