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

export default function WordProblemsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { childId } = useLocalSearchParams<{ childId: string }>();

  const [child, setChild] = useState<Child | null>(null);
  const [problem, setProblem] = useState<WordProblem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (childId && session?.user?.id) {
      fetchChild();
    }
  }, [childId, session?.user?.id]);

  const fetchChild = async () => {
    if (!childId || !session?.user?.id) return;

    setIsLoading(true);
    try {
      // Fetch child
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

      // Fetch attempts for all math operations to determine tier
      const operations: Operation[] = ["addition", "subtraction", "multiplication", "division"];
      const attemptsByOp: Record<Operation, Attempt[]> = {} as any;

      for (const op of operations) {
        const { data: attemptData } = await supabase
          .from("learning_attempts")
          .select("tier, was_correct, ai_hint_used")
          .eq("child_id", childId)
          .eq("topic", op)
          .not("tier", "is", null);

        attemptsByOp[op] = (attemptData || []).map((row: any) => ({
          tierId: row.tier,
          correct: row.was_correct,
          hintUsed: row.ai_hint_used || false,
        }));
      }

      // Generate a word problem
      const newProblem = await generateWordProblem(childId, childData.name, attemptsByOp);
      setProblem(newProblem);
      setUserAnswer("");
      setFeedback(null);
      setHintLevel(0);
      setShowHint(false);
    } catch (error) {
      console.error("[word-problems] error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowHint = async () => {
    if (hintLevel >= 2) return; // Max 2 hint levels

    setHintLevel(hintLevel + 1);
    setShowHint(true);
  };

  const handleSubmit = async () => {
    if (!problem || !childId || !session?.user?.id) return;

    const isCorrect = userAnswer.trim() === String(problem.answer);

    setIsSubmitting(true);
    try {
      // Record the attempt
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
        },
      ]);

      if (insertError) {
        console.error("[word-problems-insert] ERROR", insertError);
        setFeedback({
          isCorrect: false,
          message: `Error saving attempt: ${insertError.message}`,
        });
      } else {
        if (isCorrect) {
          setFeedback({
            isCorrect: true,
            message: "Correct! Great job! 🎉",
          });

          // Auto-load next problem after a short delay
          setTimeout(() => {
            fetchChild();
          }, 1500);
        } else {
          setFeedback({
            isCorrect: false,
            message: `Not quite. The answer is ${problem.answer}. Try again!`,
          });
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

  const handleBack = () => {
    router.push(`/child-home/${childId}`);
  };

  if (isLoading || !child || !problem) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Word Problems</Text>
        </View>

        {/* Problem Text */}
        <View style={styles.problemCard}>
          <Text style={styles.problemText}>{problem.text}</Text>
        </View>

        {/* Hint Section */}
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

        {/* Answer Input */}
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

        {/* Feedback */}
        {feedback && (
          <View
            style={[
              styles.feedbackCard,
              feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
            {!feedback.isCorrect && (
              <TouchableOpacity style={styles.nextButton} onPress={fetchChild}>
                <Text style={styles.nextButtonText}>Try Another Problem</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
    marginBottom: 24,
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
    marginBottom: 24,
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
});
