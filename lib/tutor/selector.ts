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
  const bandPriority = {
    struggling: 0,
    developing: 1,
    "needs-teach": 2,
    solid: 3,
  };

  // For each operation, determine current tier and whether it's solid.
  const progress: Array<{
    operation: Operation;
    tierId: string;
    band: "solid" | "developing" | "struggling" | "needs-teach";
    isSolid: boolean;
  }> = [];

  for (const op of operations) {
    const attempts = attemptsByOperation[op] || [];
    const { tierId, band } = currentTierAndBand(attempts, op, child);
    const isSolid = band === "solid";

    progress.push({
      operation: op,
      tierId,
      band,
      isSolid,
    });
  }

  const notSolid = progress
    .filter((p) => !p.isSolid)
    .sort((a, b) => {
      const bandDiff = bandPriority[a.band] - bandPriority[b.band];
      if (bandDiff !== 0) return bandDiff;
      return operations.indexOf(a.operation) - operations.indexOf(b.operation);
    });

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
