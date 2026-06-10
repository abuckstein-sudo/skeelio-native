import { Operation, LADDERS } from "../tutorConfig";
import { generateQuestion } from "./generate";
import { currentTierAndBand, Attempt } from "./ability";

const NAMES = [
  "Alex", "Jordan", "Casey", "Morgan", "Riley", "Taylor",
  "Sam", "Avery", "Blake", "Drew", "you"
];

const NEUTRAL_OBJECTS = [
  "apples", "stickers", "toys", "books", "stars", "cookies", "pencils",
  "marbles", "cards", "beads", "candles", "flowers", "buttons"
];

const WORD_PROBLEM_TEMPLATES: Record<Operation, string[]> = {
  addition: [
    "{name} has {a} {object}. Then they got {b} more {object}. How many {object} do they have now?",
    "{name} collected {a} {object} on Monday and {b} {object} on Tuesday. How many {object} did they collect in total?",
    "There are {a} {object} in one pile and {b} {object} in another pile. How many {object} are there altogether?",
    "{name} started with {a} {object} and found {b} more. How many {object} does {name} have now?",
    "Put {a} {object} and {b} {object} together. How many {object} are there?",
    "{name} combined {a} {object} with {b} {object}. What is the total?",
    "A store had {a} {object} and received {b} more. How many {object} does it have now?",
  ],
  subtraction: [
    "{name} had {a} {object}. They gave away {b} {object}. How many {object} are left?",
    "There were {a} {object} on the shelf. {name} took {b} {object}. How many {object} remain?",
    "{name} has {a} {object}. {b} of them are red. How many are not red?",
    "{name} started with {a} {object} and used {b} of them. How many are left?",
    "From {a} {object}, take away {b} {object}. How many are left?",
    "{name} had {a} {object}, but {b} fell out. How many does {name} have now?",
    "There are {a} {object}. If {b} are broken, how many still work?",
  ],
  multiplication: [
    "{name} has {a} bags with {b} {object} in each bag. How many {object} does {name} have altogether?",
    "There are {a} rows of {b} {object} each. How many {object} are there in total?",
    "{name} made {a} groups with {b} {object} in each group. How many {object} are there?",
    "Each box has {b} {object}. If {name} has {a} boxes, how many {object} are there?",
    "{name} arranged {a} groups of {b} {object}. How many {object} in all?",
    "There are {a} piles with {b} {object} in each pile. How many {object} altogether?",
    "{name} bought {a} packs of {b} {object} each. How many {object} did they get?",
  ],
  division: [
    "{name} has {a} {object} to share equally among {b} friends. How many {object} does each friend get?",
    "There are {a} {object} to divide into {b} equal groups. How many {object} are in each group?",
    "{name} wants to put {a} {object} into {b} containers equally. How many {object} go in each container?",
    "If {a} {object} are shared fairly among {b} people, how many does each person get?",
    "{name} has {a} {object} to split into {b} equal piles. How many are in each pile?",
    "Divide {a} {object} equally among {b} children. How many does each child get?",
    "{name} made {b} equal groups from {a} {object}. How many {object} in each group?",
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

function pickName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
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
  operation: Operation,
  attempts: Record<Operation, Attempt[]>
): Promise<WordProblem> {
  // Get the child's current tier for this operation
  const operationAttempts = attempts[operation] || [];
  const { tierId } = currentTierAndBand(operationAttempts, operation, { name: "Child" });

  // Generate the question using the existing generator
  const question = generateQuestion(operation, tierId);

  // Pick a name, object, and template (cosmetic randomness only)
  const name = pickName();
  const object = pickObject();
  const template = pickTemplate(operation);

  // Fill in the template
  const text = template
    .replace(/{name}/g, name)
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
