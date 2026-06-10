import { Operation, LADDERS } from "../tutorConfig";
import { generateQuestion } from "./generate";
import { currentTierAndBand, Attempt } from "./ability";

const NEUTRAL_OBJECTS = ["apples", "stickers", "toys", "books", "stars", "cookies"];

const WORD_PROBLEM_TEMPLATES: Record<Operation, string[]> = {
  addition: [
    "{name} has {a} {object}. Then they got {b} more {object}. How many {object} do they have now?",
    "{name} collected {a} {object} on Monday and {b} {object} on Tuesday. How many {object} did they collect in total?",
    "There are {a} {object} in one pile and {b} {object} in another pile. How many {object} are there altogether?",
    "{name} started with {a} {object} and found {b} more. How many {object} does {name} have now?",
  ],
  subtraction: [
    "{name} had {a} {object}. They gave away {b} {object}. How many {object} are left?",
    "There were {a} {object} on the shelf. {name} took {b} {object}. How many {object} remain?",
    "{name} has {a} {object}. {b} of them are red. How many are not red?",
    "{name} started with {a} {object} and used {b} of them. How many are left?",
  ],
  multiplication: [
    "{name} has {a} bags with {b} {object} in each bag. How many {object} does {name} have altogether?",
    "There are {a} rows of {b} {object} each. How many {object} are there in total?",
    "{name} made {a} groups with {b} {object} in each group. How many {object} are there?",
    "Each box has {b} {object}. If {name} has {a} boxes, how many {object} are there?",
  ],
  division: [
    "{name} has {a} {object} to share equally among {b} friends. How many {object} does each friend get?",
    "There are {a} {object} to divide into {b} equal groups. How many {object} are in each group?",
    "{name} wants to put {a} {object} into {b} containers equally. How many {object} go in each container?",
    "If {a} {object} are shared fairly among {b} people, how many does each person get?",
  ],
};

export interface WordProblem {
  text: string;
  a: number;
  b: number;
  answer: number;
  operation: Operation;
  tierId: string;
  skill: Operation;
}

function pickObject(): string {
  return NEUTRAL_OBJECTS[Math.floor(Math.random() * NEUTRAL_OBJECTS.length)];
}

function pickTemplate(operation: Operation): string {
  const templates = WORD_PROBLEM_TEMPLATES[operation];
  return templates[Math.floor(Math.random() * templates.length)];
}

export async function generateWordProblem(
  childId: string,
  childName: string,
  attempts: Record<Operation, Attempt[]>
): Promise<WordProblem> {
  // Determine which operation to use (round-robin: cycle through enabled math ops)
  const operations: Operation[] = ["addition", "subtraction", "multiplication", "division"];

  // Simple strategy: pick the operation that is NOT fully solid (or cycle through)
  // For now, use a simple round-robin by picking based on childId hash
  const operationIndex = (childId.charCodeAt(0) + childId.charCodeAt(childId.length - 1)) % operations.length;
  const operation = operations[operationIndex];

  // Get the child's current tier for this operation
  const operationAttempts = attempts[operation] || [];
  const { tierId } = currentTierAndBand(operationAttempts, operation, { name: childName });

  // Generate the question using the existing generator
  const question = generateQuestion(operation, tierId);

  // Pick an object and template
  const object = pickObject();
  const template = pickTemplate(operation);

  // Fill in the template
  const text = template
    .replace("{name}", childName)
    .replace("{a}", String(question.a))
    .replace("{b}", String(question.b))
    .replace(/{object}/g, object); // Replace all {object} occurrences

  return {
    text,
    a: question.a,
    b: question.b,
    answer: question.answer,
    operation,
    tierId,
    skill: operation,
  };
}
