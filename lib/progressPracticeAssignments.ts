import { createConjugationAssignment, createMathAssignment, createSpellingAssignment, Assignment } from "./assignments";
import { CONJUGATION_LADDER, ConjugationTierId } from "./conjugationConfig";
import { createSchoolHomeworkAssignmentItem, todayDateKey } from "./schoolHomework";
import { createSpellingItems, createSpellingList } from "./spelling";
import { SPELLING_LEXICAL_LADDER, SpellingTierId } from "./spellingConfig";
import { fetchSpellingCurriculumPool } from "./tutor/spellingCurriculum";
import { Operation } from "./tutorConfig";

export type ProgressPracticeTarget =
  | {
      subject: "math";
      operation: Operation;
      tierId: string;
      tierLabel?: string;
      missingFacts?: string[];
    }
  | {
      subject: "conjugation";
      tierId: ConjugationTierId;
      tierLabel?: string;
    }
  | {
      subject: "spelling";
      tierId: SpellingTierId;
      tierLabel?: string;
    };

export type ProgressPracticeAssignmentResult = {
  assignment: Assignment;
  taskText: string;
  target: ProgressPracticeTarget;
};

function taskKindForTarget(target: ProgressPracticeTarget): "spelling" | "division" | "multiplication" | "generic" {
  if (target.subject === "spelling") return "spelling";
  if (target.subject === "math" && target.operation === "division") return "division";
  if (target.subject === "math" && target.operation === "multiplication") return "multiplication";
  return "generic";
}

function taskTextForTarget(target: ProgressPracticeTarget): string {
  if (target.subject === "conjugation") {
    return `Conjugation: ${target.tierLabel || target.tierId}`;
  }
  if (target.subject === "spelling") {
    return `Spelling: ${target.tierLabel || target.tierId}`;
  }
  if (target.missingFacts?.length) {
    return `${target.operation} · ${target.tierId} · facts ${target.missingFacts.join(", ")}`;
  }
  return `${target.operation} · ${target.tierId}`;
}

async function createSpellingTierAssignment(childId: string, target: Extract<ProgressPracticeTarget, { subject: "spelling" }>, dueDate: string) {
  const tier = SPELLING_LEXICAL_LADDER.find((candidate) => candidate.id === target.tierId);
  const tierLabel = target.tierLabel || tier?.label || target.tierId;
  const rows = await fetchSpellingCurriculumPool({
    tierIds: [target.tierId],
    language: "fr-FR",
    limit: 10,
  });
  const words = rows.map((row) => row.word);
  if (words.length === 0) {
    throw new Error(`No spelling curriculum words found for ${target.tierId}`);
  }

  const title = `${target.tierId} · ${tierLabel}`;
  const list = await createSpellingList(childId, title, "French", "manual");
  await createSpellingItems(list.id, childId, words, "French");
  return createSpellingAssignment(childId, list.id, title, words.length, "practice", dueDate);
}

export async function createProgressPracticeAssignment(
  childId: string,
  target: ProgressPracticeTarget,
  dueDate = todayDateKey()
): Promise<ProgressPracticeAssignmentResult> {
  let assignment: Assignment;

  if (target.subject === "math") {
    assignment = await createMathAssignment({
      childId,
      topic: target.operation,
      count: 8,
      dueDate,
      mode: "practice",
      tierId: target.tierId,
      targetFactKeys: target.missingFacts,
    });
  } else if (target.subject === "conjugation") {
    const tier = CONJUGATION_LADDER.find((candidate) => candidate.id === target.tierId);
    if (!tier) throw new Error(`Unknown conjugation tier ${target.tierId}`);
    assignment = await createConjugationAssignment(
      childId,
      "fr-FR",
      tier.verbGroups,
      [tier.tense],
      8,
      dueDate,
      "practice"
    );
  } else {
    assignment = await createSpellingTierAssignment(childId, target, dueDate);
  }

  const taskText = taskTextForTarget(target);
  await createSchoolHomeworkAssignmentItem({
    childId,
    homeworkDate: dueDate,
    assignmentId: assignment.id,
    taskText,
    taskKind: taskKindForTarget(target),
    metadata: {
      linked_practice: target.subject === "math" ? target.operation : target.subject,
      assignment_subject: assignment.subject,
      assignment_mode: assignment.mode,
      progress_target: target,
    },
  });

  return { assignment, taskText, target };
}
