import { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Keyboard } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { markAssignmentComplete, Assignment, CustomQuestion } from "@/lib/assignments";
import { addStars } from "@/lib/addStars";
import { FACT_TIERS, LADDERS, Operation } from "@/lib/tutorConfig";
import { computeExampleSteps } from "@/lib/tutor/steps";
import {
  pickAdditionStrategy,
  pickSubtractionStrategy,
  pickMultiplicationStrategy,
  pickDivisionStrategy,
  StrategyPlan,
} from "@/lib/tutor/strategies";
import { StrategyView } from "@/lib/tutor/visuals";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Answer {
  questionIndex: number;
  userAnswer: string;
  isCorrect: boolean;
}

// Parser for question text with all operator variants
const OP_TO_TOPIC: Record<string, Operation> = {
  "+": "addition",
  "-": "subtraction",
  "−": "subtraction", // U+2212
  "×": "multiplication", // U+00D7
  "x": "multiplication",
  "*": "multiplication",
  "÷": "division", // U+00F7
  "/": "division",
};

function parseQuestion(text: string): { a: number; op: string; topic: Operation; b: number } | null {
  // Matches: digits, operator (including Unicode), digits, "= ?"
  // Handles: +, -, −(U+2212), ×(U+00D7), x, *, ÷(U+00F7), /
  const m = text.match(/(\d+)\s*([+\-−×x*÷/])\s*(\d+)/);
  if (!m) return null;

  const op = m[2];
  const topic = OP_TO_TOPIC[op];
  if (!topic) return null;

  return {
    a: parseInt(m[1], 10),
    op,
    topic,
    b: parseInt(m[3], 10),
  };
}

export default function HomeworkScreen() {
  const router = useRouter();
  const { assignmentId, childId } = useLocalSearchParams<{ assignmentId: string; childId: string }>();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionUserId, setSessionUserId] = useState<string>("");
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [restoredCorrect, setRestoredCorrect] = useState(0);
  const [restoredAnswered, setRestoredAnswered] = useState(0);
  const [completionStats, setCompletionStats] = useState<{
    correct: number;
    total: number;
    stars: number;
  } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // Hint state
  const [currentHintLevel, setCurrentHintLevel] = useState(0);
  const [currentHint, setCurrentHint] = useState<string>("");
  const [hintLoading, setHintLoading] = useState(false);
  const [hintUsedPerQuestion, setHintUsedPerQuestion] = useState<boolean[]>([]);
  const [mulStrategy, setMulStrategy] = useState<StrategyPlan | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getUser();
      setSessionUserId(data?.user?.id || "");
    };
    getSession();
  }, []);

  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
  }, [assignmentId]);

  const fetchAssignment = async () => {
    if (!assignmentId) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .single();

    if (dbError) {
      console.error("[homework] error loading assignment:", dbError);
      setError(dbError.message || "Failed to load assignment");
      setIsLoading(false);
      return;
    }

    const assignment = data as Assignment & { progress_index?: number; correct_count?: number };
    setAssignment(assignment);
    const qs = assignment.custom_questions || [];
    setQuestions(qs);
    setIsQuizMode(assignment.mode === "quiz");
    setHintUsedPerQuestion(new Array(qs.length).fill(false));

    // Resume where the child left off
    const savedIndex = assignment.progress_index ?? 0;
    const resumeIndex = savedIndex > 0 && savedIndex < qs.length ? savedIndex : 0;
    setCurrentQuestionIndex(resumeIndex);
    setRestoredCorrect(assignment.correct_count ?? 0);
    setRestoredAnswered(resumeIndex);

    setIsLoading(false);
  };

  // Helper to extract operands from question (with fallback parsing)
  const getOperands = (question: CustomQuestion): { a: number | undefined; b: number | undefined } => {
    // First try structured fields
    if (question.operandA !== undefined && question.operandB !== undefined) {
      return { a: question.operandA, b: question.operandB };
    }

    // Fallback: parse from question_text (format: "a op b = ?")
    const match = question.question_text.match(/^(\d+)\s*[+\−×÷]\s*(\d+)/);
    if (match) {
      return { a: parseInt(match[1]), b: parseInt(match[2]) };
    }

    return { a: undefined, b: undefined };
  };

  const handleRequestHint = async () => {
    if (isQuizMode) return; // No hints in quiz mode

    const question = questions[currentQuestionIndex];
    if (!question || !assignment) {
      return;
    }

    // Cap hints at 2
    if (currentHintLevel >= 2) {
      return;
    }

    setHintLoading(true);
    try {
      const tierId = question.tier || "";

      // Get operands: first from structured fields, then parse from question_text
      let a = question.operandA;
      let b = question.operandB;
      let op = question.operator;
      let topic = assignment.focus as Operation;

      // If structured fields missing, parse from question_text
      if (a === undefined || b === undefined) {
        const parsed = parseQuestion(question.question_text);
        if (parsed) {
          a = parsed.a;
          b = parsed.b;
          op = parsed.op;
          topic = parsed.topic;
        }
      }

      console.log(
        "[hw-hint]",
        JSON.stringify({
          a,
          b,
          op,
          topic,
          tier: tierId,
          hasStructured: question.operandA !== undefined && question.operandB !== undefined,
        })
      );

      // Check if this is a fact tier
      const isFactTier = FACT_TIERS.has(tierId);
      let hintPlan: StrategyPlan | null = null;
      let planType = "none";

      if (isFactTier && a !== undefined && b !== undefined) {
        // Use deterministic strategy picker based on operation
        if (topic === "addition") {
          hintPlan = pickAdditionStrategy(a, b);
        } else if (topic === "subtraction") {
          hintPlan = pickSubtractionStrategy(a, b);
        } else if (topic === "multiplication") {
          hintPlan = pickMultiplicationStrategy(a, b);
        } else if (topic === "division") {
          hintPlan = pickDivisionStrategy(a, b);
        }
        planType = hintPlan ? "strategy" : "none";

        console.log(
          "[hw-hint]",
          JSON.stringify({
            a,
            b,
            op,
            topic,
            tier: tierId,
            plan: planType,
            stepCount: hintPlan?.steps?.length || 0,
          })
        );

        if (hintPlan) {
          setMulStrategy(hintPlan);
          setCurrentHintLevel(currentHintLevel + 1);
        }
      } else if (a !== undefined && b !== undefined) {
        // For procedural tiers, try computed example steps first
        const steps = computeExampleSteps(topic, a, b, undefined);

        // If steps are empty, fallback to strategy picker for a visual
        if (steps.length === 0) {
          if (topic === "addition") {
            hintPlan = pickAdditionStrategy(a, b);
          } else if (topic === "subtraction") {
            hintPlan = pickSubtractionStrategy(a, b);
          } else if (topic === "multiplication") {
            hintPlan = pickMultiplicationStrategy(a, b);
          } else if (topic === "division") {
            hintPlan = pickDivisionStrategy(a, b);
          }
          planType = hintPlan ? "strategy-fallback" : "none";

          console.log(
            "[hw-hint]",
            JSON.stringify({
              a,
              b,
              op,
              topic,
              tier: tierId,
              plan: planType,
              stepCount: hintPlan?.steps?.length || 0,
            })
          );

          if (hintPlan) {
            setMulStrategy(hintPlan);
            setCurrentHintLevel(currentHintLevel + 1);
          }
        } else {
          // Has steps, show them
          planType = "steps";

          console.log(
            "[hw-hint]",
            JSON.stringify({
              a,
              b,
              op,
              topic,
              tier: tierId,
              plan: planType,
              stepCount: steps.length,
            })
          );

          setCurrentHint(`Here's how to solve it:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
          setCurrentHintLevel(currentHintLevel + 1);
        }
      }

      setHintUsedPerQuestion((prev) => {
        const updated = [...prev];
        updated[currentQuestionIndex] = true;
        return updated;
      });
    } finally {
      setHintLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!userAnswer.trim() || !sessionUserId || !childId || !assignment) {
      return;
    }

    setIsSubmitting(true);
    const question = questions[currentQuestionIndex];
    const isCorrect = userAnswer.trim() === question.correct_answer;

    try {
      const { error: insertError } = await supabase.from("learning_attempts").insert([
        {
          user_id: sessionUserId,
          child_id: childId,
          subject: question.subject,
          topic: question.topic,
          tier: question.tier,
          skill: question.skill,
          question_text: question.question_text,
          correct_answer: question.correct_answer,
          user_answer: userAnswer.trim(),
          was_correct: isCorrect,
          ai_hint_used: hintUsedPerQuestion[currentQuestionIndex] || false,
        },
      ]);

      if (insertError) {
        console.error("[homework-insert] ERROR", insertError);
        setFeedback({
          isCorrect: false,
          message: `Error saving attempt: ${insertError.message}`,
        });
      } else {
        setFeedback({
          isCorrect,
          message: isCorrect ? "✓ Correct!" : `✗ Not quite. The answer is ${question.correct_answer}.`,
        });

        const newAnswer: Answer = {
          questionIndex: currentQuestionIndex,
          userAnswer: userAnswer.trim(),
          isCorrect,
        };
        setAnswers([...answers, newAnswer]);
      }
    } catch (err) {
      console.error("[homework-insert] EXCEPTION", err);
      setFeedback({
        isCorrect: false,
        message: "Error saving attempt",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    setUserAnswer("");
    setFeedback(null);
    setCurrentHintLevel(0);
    setCurrentHint("");
    setMulStrategy(null);

    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      const correctSoFar = restoredCorrect + answers.filter((a) => a.isCorrect).length;
      if (assignmentId) {
        supabase
          .from("assignments")
          .update({ progress_index: nextIndex, correct_count: correctSoFar })
          .eq("id", assignmentId)
          .then(({ error }) => {
            if (error) console.error("[homework] progress save failed:", error.message);
          });
      }
      setCurrentQuestionIndex(nextIndex);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    if (!assignmentId || !childId || isCompleting || completionStats) return;

    setIsCompleting(true);
    try {
      const correctCount = restoredCorrect + answers.filter((a) => a.isCorrect).length;

      // Mark assignment as complete
      await markAssignmentComplete(assignmentId, {
        correctCount,
        totalCount: questions.length,
      });

      // Award stars: 1 star per correct answer
      if (correctCount > 0) {
        await addStars(childId, correctCount);
      }

      console.log("[homework] assignment completed, stars awarded:", correctCount);
      setCompletionStats({
        correct: correctCount,
        total: questions.length,
        stars: correctCount,
      });
    } catch (err) {
      console.error("[homework] completion error:", err);
      setError("Error completing assignment");
    } finally {
      setIsCompleting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!assignment || questions.length === 0 || error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || "No questions available"}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push({ pathname: "/child-home/[childId]", params: { childId } })}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const question = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isAnswered = feedback !== null;
  const canShowHint = !isQuizMode && currentHintLevel < 2 && !isAnswered;
  const showingStrategy = mulStrategy !== null && !isAnswered;

  const sessionCorrect = answers.filter((a) => a.isCorrect).length;
  const correctCount = restoredCorrect + sessionCorrect;
  const wrongCount = restoredAnswered - restoredCorrect + (answers.length - sessionCorrect);
  const headerTitle =
    (assignment.focus
      ? assignment.focus.charAt(0).toUpperCase() + assignment.focus.slice(1)
      : "Practice") + (isQuizMode ? " Quiz" : " Practice");

  if (completionStats) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completionContainer}>
          <Text style={styles.completionConfetti}>🎉</Text>
          <Text style={styles.completionTitle}>Assignment complete!</Text>
          <Text style={styles.completionSubtitle}>Nice work finishing your homework.</Text>
          <View style={styles.completionScoreBox}>
            <Text style={styles.completionScore}>
              {completionStats.correct} / {completionStats.total}
            </Text>
            <Text style={styles.completionScoreLabel}>correct</Text>
          </View>
          <View style={styles.completionStarsBox}>
            <Text style={styles.completionStarsText}>⭐ +{completionStats.stars} stars</Text>
          </View>
          <TouchableOpacity
            style={styles.completionButton}
            onPress={() =>
              router.push({
                pathname: "/child-home/[childId]",
                params: { childId },
              })
            }
          >
            <Text style={styles.completionButtonText}>Back home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Retour"
            style={styles.headerBack}
          >
            <MaterialCommunityIcons name="arrow-left" size={26} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerBarTitle} numberOfLines={1}>{headerTitle}</Text>
          <View style={styles.tally}>
            <Text style={styles.tallyCorrect}>{"✓"} {correctCount}</Text>
            <Text style={styles.tallyWrong}>{"✗"} {wrongCount}</Text>
          </View>
        </View>
        {/* Zone 1: Scrollable content (question + hint) — flex: 1 */}
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" onPress={() => Keyboard.dismiss()}>
          {/* Progress */}
          <View style={styles.header}>
            <Text style={styles.progressText}>
              {currentQuestionIndex + 1} of {questions.length}
            </Text>
            {isQuizMode && <Text style={styles.quizModeText}>Quiz mode — no hints available</Text>}
          </View>

          {/* Question */}
          <View style={styles.questionContainer}>
            <Text style={styles.questionText}>{question.question_text}</Text>

            {/* Strategy View (for fact tiers and fallback strategies in practice mode) */}
            {showingStrategy && mulStrategy && (
              <View style={styles.strategyContainer}>
                <StrategyView plan={mulStrategy} />
              </View>
            )}

            {/* Computed steps (for procedural tiers in practice mode) */}
            {currentHint && !showingStrategy && (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>{currentHint}</Text>
              </View>
            )}
          </View>

          {/* Hint Button (Practice Mode Only) */}
          {!isQuizMode && !isAnswered && (
            <TouchableOpacity
              style={[styles.hintButton, !canShowHint && styles.hintButtonDisabled]}
              onPress={handleRequestHint}
              disabled={!canShowHint || hintLoading}
            >
              <Text style={styles.hintButtonText}>
                {hintLoading ? "Loading..." : currentHintLevel === 0 ? "💡 Hint" : "💡 Hint " + currentHintLevel}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Zone 2: Fixed footer (input + button) — outside ScrollView, above keyboard */}
        <View style={styles.footer}>
          <TextInput
            style={[styles.answerInput, isAnswered && styles.answerInputDisabled]}
            placeholder="Your answer"
            value={userAnswer}
            onChangeText={setUserAnswer}
            keyboardType="numeric"
            editable={!isAnswered}
          />

          {/* Feedback */}
          {feedback && (
            <View
              style={[styles.feedbackBox, feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}
            >
              <Text style={styles.feedbackText}>{feedback.message}</Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {!isAnswered ? (
              <TouchableOpacity style={styles.checkButton} onPress={handleSubmit} disabled={isSubmitting}>
                <Text style={styles.checkButtonText}>{isSubmitting ? "..." : "Check"}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextButton, isCompleting && styles.nextButtonDisabled]}
                onPress={handleNext}
                disabled={isCompleting}
              >
                <Text style={styles.nextButtonText}>
                  {isCompleting ? "Finishing..." : isLastQuestion ? "Finish" : "Next"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  header: {
    marginBottom: 24,
  },
  backArrow: {
    alignSelf: "flex-start",
    marginBottom: 12,
    marginLeft: -4,
    padding: 4,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  headerBack: {
    padding: 4,
  },
  headerBarTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  tally: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff3e0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  tallyCorrect: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4caf50",
  },
  tallyWrong: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f44336",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  progressText: {
    fontSize: 14,
    color: "#666",
  },
  quizModeText: {
    fontSize: 12,
    color: "#ff9800",
    fontStyle: "italic",
    marginTop: 8,
    fontWeight: "600",
  },
  questionContainer: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  strategyContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    minHeight: 100,
  },
  hintBox: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#e8f5e9",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  hintText: {
    fontSize: 13,
    color: "#2e7d32",
    lineHeight: 18,
  },
  answerInput: {
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1a1a1a",
  },
  answerInputDisabled: {
    backgroundColor: "#f5f5f5",
    color: "#999",
  },
  hintButton: {
    backgroundColor: "#fff3e0",
    borderWidth: 2,
    borderColor: "#ff9800",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  hintButtonDisabled: {
    opacity: 0.5,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ff9800",
  },
  feedbackBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  feedbackCorrect: {
    backgroundColor: "#e8f5e9",
    borderWidth: 1,
    borderColor: "#4caf50",
  },
  feedbackIncorrect: {
    backgroundColor: "#ffebee",
    borderWidth: 1,
    borderColor: "#f44336",
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  checkButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  checkButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  nextButton: {
    backgroundColor: "#4caf50",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  nextButtonDisabled: {
    opacity: 0.65,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  completionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    backgroundColor: "#fff8e1",
  },
  completionConfetti: {
    fontSize: 64,
    marginBottom: 16,
  },
  completionTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  completionScoreBox: {
    minWidth: 160,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ffe082",
    marginBottom: 14,
  },
  completionScore: {
    fontSize: 34,
    fontWeight: "800",
    color: "#4caf50",
  },
  completionScoreLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "700",
    marginTop: 4,
  },
  completionStarsBox: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "#fff3e0",
    marginBottom: 28,
  },
  completionStarsText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ff9800",
  },
  completionButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  completionButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    marginBottom: 20,
    textAlign: "center",
  },
});
