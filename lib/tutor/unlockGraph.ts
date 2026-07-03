import { Operation, tierIndex } from "../tutorConfig";

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

function prerequisiteMet(
  prerequisite: SubjectPrerequisite,
  highestSolidTierByOperation: Record<Operation, string | null>
): boolean {
  const requiredIndex = tierIndex(prerequisite.operation, prerequisite.throughTierId);
  if (requiredIndex < 0) return false;

  const highestSolidTierId = highestSolidTierByOperation[prerequisite.operation];
  const highestSolidIndex = tierIndex(prerequisite.operation, highestSolidTierId);
  return highestSolidIndex >= requiredIndex;
}

export function computeUnlockState(
  highestSolidTierByOperation: Record<Operation, string | null>,
  _child: any
): Record<SubjectId, SubjectUnlockState> {
  const state = {} as Record<SubjectId, SubjectUnlockState>;

  for (const node of Object.values(SUBJECT_UNLOCK_GRAPH)) {
    if (!node.prerequisite) {
      state[node.id] = { unlocked: true };
      continue;
    }

    state[node.id] = prerequisiteMet(node.prerequisite, highestSolidTierByOperation)
      ? { unlocked: true }
      : {
          unlocked: false,
          reasonOperation: node.prerequisite.operation,
          reasonTierId: node.prerequisite.throughTierId,
        };
  }

  return state;
}
