import { supabase } from "./supabase";
import { generateQuestion, Question } from "./tutor/generate";
import { currentTierAndBand } from "./tutor/ability";
import { Operation } from "./tutorConfig";
import { generateWordProblem } from "./tutor/wordProblems";

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
}): Promise<Assignment> {
  const { childId, topic, count, dueDate, mode = "practice", wordProblemOp } = params;

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

    const { tierId } = currentTierAndBand(attempts, topic as Operation, childData || {});

    for (let i = 0; i < count; i++) {
      const genQ = generateQuestion(topic as Operation, tierId, childData?.max_times_table);
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

export async function markAssignmentComplete(assignmentId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("assignments")
    .update({
      status: "complete",
      completed_at: now,
    })
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
