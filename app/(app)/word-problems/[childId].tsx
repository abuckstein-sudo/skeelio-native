import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../_layout";
import { generateWordProblem, WordProblem } from "@/lib/tutor/wordProblems";
import { StrategyView } from "@/lib/tutor/visuals";
import { currentTierAndBand, Attempt } from "@/lib/tutor/ability";
import { Operation } from "@/lib/tutorConfig";
import {
  pickAdditionStrategy,
  pickSubtractionStrategy,
  pickMultiplicationStrategy,
  pickDivisionStrategy,
} from "@/lib/tutor/strategies";

const SESSION_LENGTH = 8;
const STARS_PER_CORRECT = 10;

interface Child {
  id: string;
  name: string;
}

function StrategyHint({
  operation,
  a,
  b,
  showStep2,
}: {
  operation: Operation;
  a: number;
  b: number;
  showStep2: boolean;
}) {
  let plan;

  if (operation === "addition") {
    plan = pickAdditionStrategy(a, b);
  } else if (operation === "subtraction") {
    plan = pickSubtractionStrategy(a, b);
  } else if (operation === "multiplication") {
    plan = pickMultiplicationStrategy(a, b);
  } else if (operation === "division") {
    plan = pickDivisionStrategy(a, b);
  }

  if (!plan) {
    return <Text style={{ fontSize: 14, color: "#666" }}>Think about how to solve this.</Text>;
  }

  return <StrategyView plan={plan} showStep2={showStep2} />;
}

type SessionMode = "picker" | "session" | "summary";

export default function WordProblemsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { childId } = useLocalSearchParams<{ childId: string }>();

  const [child, setChild] = useState<Child | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<SessionMode>("picker");
  const [selectedOperation, setSelectedOperation] = useState<Operation | "mixed">("mixed");
  const [attemptsByOp, setAttemptsByOp] = useState<Record<Operation, Attempt[]>>({} as any);

  // Session state
  const [problem, setProblem] = useState<WordProblem | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // Session progress
  const [questionCount, setQuestionCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    if (childId && session?.user?.id) {
      fetchChild();
    }
  }, [childId, session?.user?.id]);

  const fetchChild = async () => {
    if (!childId || !session?.user?.id) return;

    setIsLoading(true);
    try {
      const { data: childData, error: childError } = await supabase
        .from("children")
        .select("id, name")
        .eq("id", childId)
        .single();

      if (childError) {
        console.error("[word-problems] child fetch error:", childError);
        setIsLoading(false);
        return;
      }

      setChild(childData);

      const operations: Operation[] = ["addition", "subtraction", "multiplication", "division"];
      const attemptsByOpData: Record<Operation, Attempt[]> = {} as any;

      for (const op of operations) {
        const { data: attemptData } = await supabase
          .from("learning_attempts")
          .select("tier, question_text, was_correct, ai_hint_used, evidence_source")
          .eq("child_id", childId)
          .eq("topic", op)
          .not("tier", "is", null);

        attemptsByOpData[op] = (attemptData || []).map((row: any) => ({
          tierId: row.tier,
          correct: row.was_correct,
          hintUsed: row.ai_hint_used || false,
          questionText: row.question_text,
          evidenceSource: row.evidence_source,
        }));
      }

      setAttemptsByOp(attemptsByOpData);
    } catch (error) {
      console.error("[word-problems] error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateNextProblem = async (operationOverride?: Operation | "mixed") => {
    if (!child) return;

    const op = operationOverride ?? selectedOperation;
    let operation: Operation;
    if (op === "mixed") {
      const ops: Operation[] = ["addition", "subtraction", "multiplication", "division"];
      const randomIndex = Math.floor(Math.random() * ops.length);
      operation = ops[randomIndex];
    } else {
      operation = op;
    }

    const newProblem = await generateWordProblem(childId, operation, attemptsByOp);
    setProblem(newProblem);
    setUserAnswer("");
    setFeedback(null);
    setHintLevel(0);
    setShowHint(false);
  };

  const handleStartSession = async (op: Operation | "mixed") => {
    setSelectedOperation(op);
    setMode("session");
    setQuestionCount(0);
    setCorrectCount(0);
    setProblem(null);

    // Generate first problem WITH the chosen operation (don't wait for state update)
    // Pass operation directly so it's used immediately, not via stale selectedOperation state
    const firstOp = op === "mixed" ? (["addition", "subtraction", "multiplication", "division"][Math.floor(Math.random() * 4)] as Operation) : op;
    const wordProblem = await generateWordProblem(childId, firstOp, attemptsByOp);
    setProblem(wordProblem);
  };

  const handleShowHint = () => {
    if (hintLevel >= 2) return;
    setHintLevel(hintLevel + 1);
    setShowHint(true);
  };

  const handleSubmit = async () => {
    if (!problem || !childId || !session?.user?.id) return;

    const isCorrect = userAnswer.trim() === String(problem.answer);

    setIsSubmitting(true);
    try {
      const { error: insertError } = await supabase.from("learning_attempts").insert([
        {
          user_id: session.user.id,
          child_id: childId,
          subject: "math",
          topic: "word_problems",
          tier: problem.tierId,
          skill: problem.operation,
          question_text: problem.text,
          correct_answer: String(problem.answer),
          user_answer: userAnswer.trim(),
          was_correct: isCorrect,
          ai_hint_used: hintLevel > 0,
          evidence_source: "word_problem",
        },
      ]);

      if (insertError) {
        console.error("[word-problems-insert] ERROR", insertError);
        setFeedback({
          isCorrect: false,
          message: `Error saving attempt: ${insertError.message}`,
        });
      } else {
        const newCorrectCount = isCorrect ? correctCount + 1 : correctCount;
        setCorrectCount(newCorrectCount);
        setQuestionCount(questionCount + 1);

        setFeedback({
          isCorrect,
          message: isCorrect
            ? "Correct! Great job! 🎉"
            : `Not quite. The answer is ${problem.answer}.`,
        });

        // Check if session is complete (FIX #2: session length)
        if (questionCount + 1 >= SESSION_LENGTH) {
          setTimeout(() => {
            setMode("summary");
          }, 800);
        }
      }
    } catch (error) {
      console.error("[word-problems-submit] error:", error);
      setFeedback({
        isCorrect: false,
        message: "An error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (questionCount >= SESSION_LENGTH) {
      setMode("summary");
    } else {
      await generateNextProblem();
    }
  };

  const awardStarsAndReturn = async () => {
    if (!childId || !session?.user?.id) return;

    const starsEarned = correctCount * STARS_PER_CORRECT;
    if (starsEarned > 0) {
      const { data: rewardData, error: fetchError } = await supabase
        .from("rewards")
        .select("stars")
        .eq("child_id", childId)
        .maybeSingle();

      const currentStars = rewardData?.stars || 0;
      const newStars = currentStars + starsEarned;

      if (rewardData?.id) {
        await supabase
          .from("rewards")
          .update({ stars: newStars })
          .eq("id", rewardData.id);
      } else {
        await supabase.from("rewards").insert([
          {
            user_id: session.user.id,
            child_id: childId,
            stars: newStars,
          },
        ]);
      }
    }

    router.push(`/child-home/${childId}`);
  };

  const handleEndSession = async () => {
    await awardStarsAndReturn();
  };

  const handleBack = () => {
    if (mode === "session" || mode === "summary") {
      setMode("picker");
      setProblem(null);
      setQuestionCount(0);
      setCorrectCount(0);
    } else {
      router.push(`/child-home/${childId}`);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  // Operation Picker Mode
  if (mode === "picker") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.push(`/child-home/${childId}`)}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Word Problems</Text>
          </View>

          <Text style={styles.pickerPrompt}>Choose an operation:</Text>

          <TouchableOpacity
            style={styles.operationButton}
            onPress={() => handleStartSession("addition")}
          >
            <Text style={styles.operationButtonText}>➕ Addition</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.operationButton}
            onPress={() => handleStartSession("subtraction")}
          >
            <Text style={styles.operationButtonText}>➖ Subtraction</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.operationButton}
            onPress={() => handleStartSession("multiplication")}
          >
            <Text style={styles.operationButtonText}>✖️ Multiplication</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.operationButton}
            onPress={() => handleStartSession("division")}
          >
            <Text style={styles.operationButtonText}>➗ Division</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.operationButton, styles.mixedButton]}
            onPress={() => handleStartSession("mixed")}
          >
            <Text style={styles.operationButtonText}>🎲 Mixed</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Summary Mode
  if (mode === "summary") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Session Complete</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Great Job!</Text>
            <Text style={styles.summaryScore}>
              {correctCount} / {SESSION_LENGTH} correct
            </Text>
            <Text style={styles.summaryStars}>
              ⭐ {correctCount * STARS_PER_CORRECT} stars earned
            </Text>
          </View>

          <TouchableOpacity style={styles.finishButton} onPress={handleEndSession}>
            <Text style={styles.finishButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Session Mode
  if (!problem) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Zone 1: Scrollable content (problem + hint) — flex: 1 */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onPress={() => Keyboard.dismiss()}
        >
          <View style={styles.sessionHeader}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={handleBack}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.title}>
                {selectedOperation === "mixed"
                  ? "Mixed Problems"
                  : selectedOperation.charAt(0).toUpperCase() + selectedOperation.slice(1)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.endSessionButton}
              onPress={handleEndSession}
            >
              <Text style={styles.endSessionButtonText}>✕ End</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.progressText}>
            Question {questionCount + 1} of {SESSION_LENGTH}
          </Text>

          <View style={styles.problemCard}>
            <Text style={styles.problemText}>{problem.text}</Text>
          </View>

          {!feedback && (
            <View style={styles.hintSection}>
              <TouchableOpacity
                style={[styles.hintButton, hintLevel >= 2 && styles.hintButtonDisabled]}
                onPress={handleShowHint}
                disabled={hintLevel >= 2}
              >
                <Text style={styles.hintButtonText}>
                  {hintLevel === 0 ? "Need help?" : `Hint ${hintLevel} of 2`}
                </Text>
              </TouchableOpacity>

              {showHint && hintLevel > 0 && (
                <View style={styles.hintDisplay}>
                  <StrategyHint operation={problem.operation} a={problem.a} b={problem.b} showStep2={hintLevel >= 2} />
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Zone 2: Fixed footer (input + button) — outside ScrollView, above keyboard */}
        <View style={styles.footer}>
          {!feedback && (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Your answer:</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter a number"
                keyboardType="numeric"
                value={userAnswer}
                onChangeText={setUserAnswer}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting || !userAnswer.trim()}
              >
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? "Checking..." : "Check Answer"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {feedback && (
            <View
              style={[
                styles.feedbackCard,
                feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
              ]}
            >
              <Text style={styles.feedbackText}>{feedback.message}</Text>
              {questionCount < SESSION_LENGTH && (
                <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                  <Text style={styles.nextButtonText}>Next</Text>
                </TouchableOpacity>
              )}
              {questionCount >= SESSION_LENGTH && (
                <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                  <Text style={styles.nextButtonText}>See Results</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  scrollContent: {
    padding: 16,
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
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  problemCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  problemText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    lineHeight: 24,
  },
  hintSection: {
    marginBottom: 24,
  },
  hintButton: {
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#2196f3",
    marginBottom: 12,
  },
  hintButtonDisabled: {
    opacity: 0.5,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
    textAlign: "center",
  },
  hintDisplay: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  inputSection: {
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  feedbackCard: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 0,
  },
  feedbackCorrect: {
    backgroundColor: "#c8e6c9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  feedbackIncorrect: {
    backgroundColor: "#ffcdd2",
    borderLeftWidth: 4,
    borderLeftColor: "#f44336",
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  nextButton: {
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  pickerPrompt: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 24,
    textAlign: "center",
  },
  operationButton: {
    backgroundColor: "#e3f2fd",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#2196f3",
  },
  mixedButton: {
    backgroundColor: "#f3e5f5",
    borderColor: "#9c27b0",
  },
  operationButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  endSessionButton: {
    backgroundColor: "#ffebee",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#f44336",
  },
  endSessionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f44336",
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  summaryCard: {
    backgroundColor: "#f0f9f0",
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#4caf50",
    alignItems: "center",
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  summaryScore: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4caf50",
    marginBottom: 12,
  },
  summaryStars: {
    fontSize: 20,
    fontWeight: "600",
    color: "#ffc107",
  },
  finishButton: {
    backgroundColor: "#4caf50",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  finishButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
});
