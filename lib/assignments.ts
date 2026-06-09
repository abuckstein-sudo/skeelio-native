import { supabase } from "./supabase";
import { generateQuestion, Question } from "./tutor/generate";
import { currentTierAndBand } from "./tutor/ability";
import { Operation } from "./tutorConfig";

export type CustomQuestion = {
  question_text: string;
  correct_answer: string;
  question_type: "numeric" | "multiple_choice" | "short_answer";
  options?: string[];
  subject: string;
  topic: string;
  skill?: string;
  tier?: string;
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

  return {
    question_text,
    correct_answer: String(generatedQ.answer),
    question_type: "numeric",
    subject: "math",
    topic: topic,
    skill: undefined,
    tier: generatedQ.tierId,
  };
}

export async function createMathAssignment(params: {
  childId: string;
  topic: Operation;
  count: number;
  dueDate?: string | null;
}): Promise<Assignment> {
  const { childId, topic, count, dueDate } = params;

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
    .select("max_addition_number, max_times_table, math_subtraction_level, math_division_level")
    .eq("id", childId)
    .single();

  // Fetch attempt data for tier and band calculation
  const { data: attemptData } = await supabase
    .from("learning_attempts")
    .select("tier, was_correct, ai_hint_used")
    .eq("child_id", childId)
    .eq("topic", topic)
    .not("tier", "is", null);

  // Convert to attempt format
  const attempts = (attemptData || []).map((row: any) => ({
    tierId: row.tier,
    correct: row.was_correct,
    hintUsed: row.ai_hint_used || false,
  }));

  // Get current tier
  const { tierId } = currentTierAndBand(attempts, topic, childData || {});

  // Generate questions at this tier
  const customQuestions: CustomQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const genQ = generateQuestion(topic, tierId, childData?.max_times_table);
    customQuestions.push(questionToCustom(genQ, topic));
  }

  // Insert assignment
  const { data: newAssignment, error } = await supabase
    .from("assignments")
    .insert({
      parent_id: parentId,
      child_id: childId,
      subject: "math",
      focus: topic,
      mode: "regular",
      question_count: count,
      due_date: dueDate || null,
      status: "active",
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
      status: "completed",
      completed_at: now,
    })
    .eq("id", assignmentId);

  if (error) {
    console.error("[assignments] error marking complete:", error);
    throw error;
  }
}
