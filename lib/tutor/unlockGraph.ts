import { LADDERS, Operation, startingTier, tierIndex } from "../tutorConfig";

export type SubjectId =
  | Operation
  | "word_problems"
  | "spelling"
  | "conjugation"
  | "reading";

export interface SubjectPrerequisite {
  operation: Operation;
  throughTierId: string;
}

export interface SubjectUnlockNode {
  id: SubjectId;
  prerequisite?: SubjectPrerequisite;
}

export interface SubjectUnlockState {
  unlocked: boolean;
  reasonTierId?: string;
  reasonOperation?: Operation;
}

export const SUBJECT_UNLOCK_GRAPH: Record<SubjectId, SubjectUnlockNode> = {
  addition: { id: "addition" },
  subtraction: {
    id: "subtraction",
    prerequisite: { operation: "addition", throughTierId: "A1" },
  },
  multiplication: {
    id: "multiplication",
    prerequisite: { operation: "addition", throughTierId: "A4" },
  },
  division: {
    id: "division",
    prerequisite: { operation: "multiplication", throughTierId: "M2" },
  },
  word_problems: {
    id: "word_problems",
    prerequisite: { operation: "addition", throughTierId: "A1" },
  },
  spelling: { id: "spelling" },
  conjugation: { id: "conjugation" },
  reading: { id: "reading" },
};

function hasExplicitNonDefaultStart(operation: Operation, child: any): boolean {
  const defaultTier = startingTier(operation, {});
  const childTier = startingTier(operation, child || {});
  if (childTier === defaultTier) return false;

  if (operation === "addition") {
    return child?.max_addition_number != null;
  }
  if (operation === "subtraction") {
    return Boolean(child?.math_subtraction_level && child.math_subtraction_level !== "not_started");
  }
  if (operation === "multiplication") {
    return child?.max_times_table != null;
  }
  return Boolean(child?.math_division_level && child.math_division_level !== "not_started");
}

function explicitStartMeets(operation: Operation, throughTierId: string, child: any): boolean {
  if (!hasExplicitNonDefaultStart(operation, child)) return false;
  return tierIndex(operation, startingTier(operation, child || {})) >= tierIndex(operation, throughTierId);
}

function prerequisiteMet(
  prerequisite: SubjectPrerequisite,
  highestSolidTierByOperation: Record<Operation, string | null>,
  child: any
): boolean {
  const requiredIndex = tierIndex(prerequisite.operation, prerequisite.throughTierId);
  if (requiredIndex < 0) return false;

  const highestSolidTierId = highestSolidTierByOperation[prerequisite.operation];
  const highestSolidIndex = tierIndex(prerequisite.operation, highestSolidTierId);
  return highestSolidIndex >= requiredIndex || explicitStartMeets(prerequisite.operation, prerequisite.throughTierId, child);
}

export function computeUnlockState(
  highestSolidTierByOperation: Record<Operation, string | null>,
  child: any
): Record<SubjectId, SubjectUnlockState> {
  const state = {} as Record<SubjectId, SubjectUnlockState>;

  for (const node of Object.values(SUBJECT_UNLOCK_GRAPH)) {
    if (LADDERS[node.id as Operation] && hasExplicitNonDefaultStart(node.id as Operation, child)) {
      state[node.id] = { unlocked: true };
      continue;
    }

    if (!node.prerequisite) {
      state[node.id] = { unlocked: true };
      continue;
    }

    state[node.id] = prerequisiteMet(node.prerequisite, highestSolidTierByOperation, child)
      ? { unlocked: true }
      : {
          unlocked: false,
          reasonOperation: node.prerequisite.operation,
          reasonTierId: node.prerequisite.throughTierId,
        };
  }

  return state;
}
