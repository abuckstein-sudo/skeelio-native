import { supabase } from "./supabase";
import { generateQuestion, Question } from "./tutor/generate";
import { currentTierAndBand } from "./tutor/ability";
import { Operation } from "./tutorConfig";
import { generateWordProblem } from "./tutor/wordProblems";
import { getListItems } from "./spelling";

export type CustomQuestion = {
  question_text: string;
  correct_answer: string;
  question_type: "numeric" | "multiple_choice" | "short_answer";
  options?: string[];
  subject: string;
  topic: string;
  skill?: string;
  tier?: string;
  operandA?: number;
  operandB?: number;
  operator?: string;
  assignmentTables?: number[];
};

export type Assignment = {
  id: string;
  parent_id: string;
  child_id: string;
  subject: string;
  focus: string; // topic like "addition", "multiplication", etc.
  mode: string; // "regular" for now
  question_count: number;
  due_date: string | null;
  status: string; // "active" or "completed"
  created_at: string;
  completed_at: string | null;
  progress_index?: number | null;
  correct_count?: number | null;
  custom_questions: CustomQuestion[];
};

export async function listAssignmentsForChild(childId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("child_id", childId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[assignments] error listing:", error);
    return [];
  }

  return (data || []) as Assignment[];
}

function getOperationSymbol(topic: Operation): string {
  if (topic === "addition") return "+";
  if (topic === "subtraction") return "−";
  if (topic === "multiplication") return "×";
  if (topic === "division") return "÷";
  return "?";
}

function questionToCustom(
  generatedQ: Question,
  topic: Operation
): CustomQuestion {
  const symbol = getOperationSymbol(topic);
  const question_text = `${generatedQ.a} ${symbol} ${generatedQ.b} = ?`;

  let skill: string | undefined;
  if (topic === "addition") {
    skill = `+${Math.max(generatedQ.a, generatedQ.b)}`;
  } else if (topic === "subtraction") {
    skill = `-${generatedQ.b}`;
  } else if (topic === "multiplication") {
    skill = `×${Math.max(generatedQ.a, generatedQ.b)}`;
  } else if (topic === "division") {
    skill = `÷${generatedQ.b}`;
  }

  return {
    question_text,
    correct_answer: String(generatedQ.answer),
    question_type: "numeric",
    subject: "math",
    topic: topic,
    skill,
    tier: generatedQ.tierId,
    operandA: generatedQ.a,
    operandB: generatedQ.b,
    operator: getOperationSymbol(topic),
  };
}

function wordProblemToCustom(
  wordProblem: Awaited<ReturnType<typeof generateWordProblem>>
): CustomQuestion {
  return {
    question_text: wordProblem.text,
    correct_answer: String(wordProblem.answer),
    question_type: "numeric",
    subject: "math",
    topic: "word_problems",
    skill: wordProblem.skill,
    tier: wordProblem.tierId,
    operandA: wordProblem.a,
    operandB: wordProblem.b,
    operator: wordProblem.operation,
  };
}

export async function createMathAssignment(params: {
  childId: string;
  topic: Operation | "word_problems";
  count: number;
  dueDate?: string | null;
  mode?: "practice" | "quiz";
  wordProblemOp?: Operation | "mixed";
  multiplicationTables?: number[];
}): Promise<Assignment> {
  const { childId, topic, count, dueDate, mode = "practice", wordProblemOp, multiplicationTables } = params;

  // Get the current authenticated user to ensure parent_id is set correctly
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    console.error("[assignments] auth error:", authError);
    throw new Error("Not authenticated");
  }
  const parentId = authData.user.id;

  // Fetch child data for tier calculation
  const { data: childData } = await supabase
    .from("children")
    .select("max_addition_number, max_times_table, math_subtraction_level, math_division_level, id, name")
    .eq("id", childId)
    .single();

  // Fetch attempt data for tier and band calculation
  const { data: attemptData } = await supabase
    .from("learning_attempts")
    .select("tier, was_correct, ai_hint_used, topic, skill")
    .eq("child_id", childId)
    .not("tier", "is", null);

  const customQuestions: CustomQuestion[] = [];

  if (topic === "word_problems") {
    // Generate word problems
    // First, organize attempts by operation
    const mathOps: Operation[] = ["addition", "subtraction", "multiplication", "division"];
    const attemptsByOp: Record<Operation, any[]> = {} as any;

    for (const op of mathOps) {
      attemptsByOp[op] = (attemptData || [])
        .filter((row: any) => row.topic === op || row.skill === op)
        .map((row: any) => ({
          tierId: row.tier,
          correct: row.was_correct,
          hintUsed: row.ai_hint_used || false,
        }));
    }

    for (let i = 0; i < count; i++) {
      // Use selected operation or rotate if mixed
      let op: Operation;
      if (wordProblemOp === "mixed") {
        const opIndex = i % mathOps.length;
        op = mathOps[opIndex];
      } else {
        op = wordProblemOp || "mixed" as any; // fallback to mixed if not specified
        if (op === "mixed" as any) {
          const opIndex = i % mathOps.length;
          op = mathOps[opIndex];
        }
      }
      const wordProblem = await generateWordProblem(childId, op, attemptsByOp);
      customQuestions.push(wordProblemToCustom(wordProblem));
    }
  } else {
    // Generate regular math questions
    const attempts = (attemptData || [])
      .filter((row: any) => row.topic === topic)
      .map((row: any) => ({
        tierId: row.tier,
        correct: row.was_correct,
        hintUsed: row.ai_hint_used || false,
      }));

    const tables = Array.isArray(multiplicationTables)
      ? multiplicationTables.filter((table) => Number.isInteger(table) && table >= 0 && table <= 12)
      : [];
    const { tierId } = currentTierAndBand(attempts, topic as Operation, childData || {});

    for (let i = 0; i < count; i++) {
      const genQ =
        topic === "multiplication" && tables.length > 0
          ? generateMultiplicationTableQuestion(tables, tierId)
          : generateQuestion(topic as Operation, tierId, childData?.max_times_table);
      customQuestions.push(questionToCustom(genQ, topic as Operation));
    }
  }

  // Insert assignment
  const { data: newAssignment, error } = await supabase
    .from("assignments")
    .insert({
      parent_id: parentId,
      child_id: childId,
      subject: "math",
      focus: topic,
      mode,
      question_count: count,
      due_date: dueDate || null,
      status: "pending",
      custom_questions: customQuestions,
    })
    .select()
    .single();

  if (error) {
    console.error(
      "[assignments] error creating:",
      JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
    );
    throw error;
  }

  return newAssignment as Assignment;
}

function generateMultiplicationTableQuestion(tables: number[], tierId: string): Question {
  const table = tables[Math.floor(Math.random() * tables.length)];
  const other = Math.floor(Math.random() * 13);
  const [a, b] = Math.random() < 0.5 ? [table, other] : [other, table];
  return {
    operation: "multiplication",
    tierId,
    a,
    b,
    answer: a * b,
  };
}

export async function markAssignmentComplete(
  assignmentId: string,
  stats?: { correctCount?: number; totalCount?: number }
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: "complete",
    completed_at: now,
  };

  if (typeof stats?.correctCount === "number") {
    updates.correct_count = stats.correctCount;
  }

  if (typeof stats?.totalCount === "number") {
    updates.progress_index = stats.totalCount;
  }

  const { error } = await supabase
    .from("assignments")
    .update(updates)
    .eq("id", assignmentId);

  if (error) {
    console.error(
      "[assignments] error marking complete:",
      JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
    );
    throw error;
  }

  await supabase
    .from("school_homework_items")
    .update({
      status: "done",
      completed_at: now,
      completed_by: "child",
      updated_at: now,
    })
    .eq("linked_assignment_id", assignmentId);
}

export async function createSpellingAssignment(
  childId: string,
  listId: string,
  listTitle: string,
  _wordCount: number, // Ignored; we fetch the real count fresh
  mode: "practice" | "quiz",
  dueDate?: string | null
): Promise<Assignment> {
  // Get the current authenticated user
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    console.error("[assignments] auth error:", authError);
    throw new Error("Not authenticated");
  }
  const parentId = authData.user.id;

  console.log("[createSpellingAssignment] creating with listId:", listId, "listTitle:", listTitle);

  // Fetch the items fresh to get the real word count
  const items = await getListItems(listId);
  const realWordCount = items.length;

  console.log("[createSpellingAssignment] fetched items count:", realWordCount);

  // Only treat as empty if the fresh fetch returns 0 items
  if (realWordCount === 0) {
    throw new Error("This list has no words");
  }

  // Insert spelling assignment with the real word count
  const { data: newAssignment, error } = await supabase
    .from("assignments")
    .insert({
      parent_id: parentId,
      child_id: childId,
      subject: "spelling",
      mode,
      question_count: realWordCount,
      due_date: dueDate || null,
      status: "pending",
      custom_questions: {
        kind: "spelling",
        list_id: listId,
        title: listTitle,
      },
    })
    .select()
    .single();

  if (error) {
    console.error(
      "[assignments] error creating spelling assignment:",
      JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
    );
    throw error;
  }

  console.log("[createSpellingAssignment] created assignment:", newAssignment.id, "with question_count:", realWordCount);
  return newAssignment as Assignment;
}

export async function createConjugationAssignment(
  childId: string,
  language: string,
  verbGroups: string[],
  tenses: string[],
  questionCount: number,
  dueDate?: string | null
): Promise<Assignment> {
  // Get the current authenticated user
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    console.error("[assignments] auth error:", authError);
    throw new Error("Not authenticated");
  }
  const parentId = authData.user.id;

  console.log("[createConjugationAssignment] creating with language:", language, "groups:", verbGroups, "tenses:", tenses, "count:", questionCount);

  // Create readable focus summary
  const groupLabels = verbGroups.map((g) => {
    const labels: Record<string, string> = {
      groupe_1: "-er",
      groupe_2: "-ir",
      groupe_3: "-re",
      irregulier: "Irregular",
    };
    return labels[g] || g;
  });
  const focus = `${tenses.join(", ")} · ${groupLabels.join(", ")}`;

  // Insert conjugation assignment
  const { data: newAssignment, error } = await supabase
    .from("assignments")
    .insert({
      parent_id: parentId,
      child_id: childId,
      subject: "conjugation",
      focus,
      mode: "practice",
      question_count: questionCount,
      due_date: dueDate || null,
      status: "pending",
      custom_questions: {
        kind: "conjugation",
        language,
        verb_groups: verbGroups,
        tenses,
      },
    })
    .select()
    .single();

  if (error) {
    console.error(
      "[assignments] error creating conjugation assignment:",
      JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
    );
    throw error;
  }

  console.log("[createConjugationAssignment] created assignment:", newAssignment.id);
  return newAssignment as Assignment;
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);

  if (error) {
    console.error(
      "[assignments] error deleting:",
      JSON.stringify({
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      })
    );
    throw error;
  }
}
