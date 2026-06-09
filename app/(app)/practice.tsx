import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { addStars } from "@/lib/addStars";
import { generateQuestion, pickTeachExample } from "@/lib/tutor/generate";
import { currentTierAndBand, Attempt } from "@/lib/tutor/ability";
import { LADDERS, GATE, Operation, TEACH_NOTES, FACT_TIERS } from "@/lib/tutorConfig";
import { computeExampleSteps } from "@/lib/tutor/steps";
import {
  pickMultiplicationStrategy,
  pickAdditionStrategy,
  pickSubtractionStrategy,
  pickDivisionStrategy,
  StrategyPlan,
} from "@/lib/tutor/strategies";
import {
  DotGroups,
  DotArray,
  NumberLine,
  DoublingChain,
  PartBar,
  RemoveBar,
  StrategyView,
} from "@/lib/tutor/visuals";
import { useAuth } from "../_layout";

interface Answer {
  questionIndex: number;
  userAnswer: string;
  isCorrect: boolean;
}

interface TeachingMethod {
  method_name: string;
  method_description: string;
}

interface PracticeHintResponse {
  hint: string;
  reveals_answer: boolean;
}

interface TeachData {
  intro: string;
  example_walkthrough: string[];
  encouragement: string;
}

export default function PracticeScreen() {
  const router = useRouter();
  const { topic, childId } = useLocalSearchParams<{ topic: string; childId: string }>();
  const { session } = useAuth();

  // Adaptive engine state
  const [tierId, setTierId] = useState<string>("");
  const [tierLabel, setTierLabel] = useState<string>("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Hint state (all operations)
  const [currentHintLevel, setCurrentHintLevel] = useState(0);
  const [currentHint, setCurrentHint] = useState<string>("");
  const [hintLoading, setHintLoading] = useState(false);
  const [hintUsedPerQuestion, setHintUsedPerQuestion] = useState<boolean[]>([]);
  const [childLanguage, setChildLanguage] = useState<string>("English");
  const [operationMethods, setOperationMethods] = useState<Record<string, TeachingMethod | null>>({
    addition: null,
    subtraction: null,
    multiplication: null,
    division: null,
  });

  // Multiplication strategy state
  const [mulStrategy, setMulStrategy] = useState<StrategyPlan | null>(null);

  // Outcome state
  const [sessionComplete, setSessionComplete] = useState(false);
  const [outcomeMessage, setOutcomeMessage] = useState<string>("");
  const [outcomeBand, setOutcomeBand] = useState<"solid" | "developing" | "struggling">("developing");

  // Teach state
  const [teachData, setTeachData] = useState<TeachData | null>(null);
  const [teachLoading, setTeachLoading] = useState(false);
  const [teachAcknowledged, setTeachAcknowledged] = useState(false);

  useEffect(() => {
    if (!topic || !childId || !session?.user?.id) {
      console.log("[practice] missing params or session");
      return;
    }

    const initializePractice = async () => {
      try {
        // Fetch child data for starting tier calculation
        const { data: childData } = await supabase
          .from("children")
          .select("max_addition_number, max_times_table, math_subtraction_level, math_division_level, preferred_language, languages")
          .eq("id", childId)
          .single();

        // Set child language for hints
        const language = childData?.preferred_language || childData?.languages?.[0] || "English";
        setChildLanguage(language);

        // Fetch attempt log for this operation
        const { data: attemptData, error: attemptError } = await supabase
          .from("learning_attempts")
          .select("tier, was_correct, ai_hint_used")
          .eq("child_id", childId)
          .eq("topic", topic)
          .not("tier", "is", null); // Ignore old data without tier

        if (attemptError) {
          console.error("[practice] error fetching attempts:", attemptError);
        }

        // Convert to attempt format: [{tierId, correct, hintUsed}]
        const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
          tierId: row.tier,
          correct: row.was_correct,
          hintUsed: row.ai_hint_used || false,
        }));

        // Get current tier and band
        const { tierId: workingTierId, band } = currentTierAndBand(
          attempts,
          topic as Operation,
          childData || {}
        );

        // Find tier label
        const ladder = LADDERS[topic as Operation];
        const tierObj = ladder.find((t) => t.id === workingTierId);
        const label = tierObj?.label || workingTierId;

        setTierId(workingTierId);
        setTierLabel(label);

        // Check attempt count for this tier
        const tierAttempts = attemptData?.filter((a: any) => a.tier === workingTierId) || [];

        // If this is first time at this tier (OR needs-teach), route to lesson
        if (tierAttempts.length === 0 || band === "needs-teach") {
          router.replace({
            pathname: "/lesson/[childId]",
            params: { childId, tierId: workingTierId, tierLabel: label, operation: topic },
          });
          return;
        }

        // Lesson flow now handles needs-teach (routing happens above before this code)

        // Fetch teaching methods for all operations (for hints during practice)
        const methods: Record<string, TeachingMethod | null> = {
          addition: null,
          subtraction: null,
          multiplication: null,
          division: null,
        };

        for (const op of ["addition", "subtraction", "multiplication", "division"]) {
          const { data: method } = await supabase
            .from("child_teaching_methods")
            .select("method_name, method_description")
            .eq("child_id", childId)
            .eq("subject", op)
            .eq("confirmed", true)
            .maybeSingle();

          if (method) {
            methods[op] = method as TeachingMethod;
          }
        }
        setOperationMethods(methods);

        // Generate set of questions
        const numQuestions = GATE.minAttemptsToAdvance;
        const qs = [];
        for (let i = 0; i < numQuestions; i++) {
          const q = generateQuestion(topic as Operation, workingTierId, childData?.max_times_table);
          qs.push(q);
        }
        setQuestions(qs);
        setHintUsedPerQuestion(new Array(numQuestions).fill(false));
        setIsLoading(false);
      } catch (err) {
        console.error("[practice] initialization error:", err);
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    initializePractice();
  }, [topic, childId, session]);

  const handleRequestHint = async () => {
    const question = questions[currentQuestionIndex];
    if (!question.a || !question.b || !topic || !tierId) {
      return;
    }

    setHintLoading(true);
    try {
      // Check if this is a fact tier
      const isFactTier = FACT_TIERS.has(tierId);

      if (isFactTier) {
        // Use deterministic strategy picker based on operation
        let strategy: StrategyPlan | null = null;

        if (topic === "addition") {
          strategy = pickAdditionStrategy(question.a, question.b);
        } else if (topic === "subtraction") {
          strategy = pickSubtractionStrategy(question.a, question.b);
        } else if (topic === "multiplication") {
          strategy = pickMultiplicationStrategy(question.a, question.b);
        } else if (topic === "division") {
          strategy = pickDivisionStrategy(question.a, question.b);
        }

        if (strategy) {
          setMulStrategy(strategy);
          setCurrentHintLevel(currentHintLevel + 1);
        }
      } else {
        // For procedural / multi-digit tiers, use AI practice-hint
        const steps = computeExampleSteps(
          topic as Operation,
          question.a,
          question.b,
          question.remainder
        );

        const method = operationMethods[topic as Operation]?.method_name;

        const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        const res = await fetch(`${baseUrl}/functions/v1/practice-hint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            operation: topic,
            problem: {
              a: question.a,
              b: question.b,
              answer: question.answer,
              remainder: question.remainder,
            },
            steps,
            hintLevel: currentHintLevel + 1,
            method,
            language: childLanguage,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("[hint] error", res.status, errorText);
          return;
        }

        const hintData = (await res.json()) as PracticeHintResponse;
        setCurrentHint(hintData.hint);
        setCurrentHintLevel(currentHintLevel + 1);
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
    if (!userAnswer.trim() || !session?.user?.id || !childId || !topic || !tierId) {
      return;
    }

    setIsSubmitting(true);
    const question = questions[currentQuestionIndex];
    const isCorrect = userAnswer.trim() === String(question.answer);

    try {
      // Insert into learning_attempts with tier
      const { error } = await supabase.from("learning_attempts").insert([
        {
          user_id: session.user.id,
          child_id: childId,
          subject: "math",
          topic: topic,
          tier: tierId,
          question_text: question.operation
            ? `${question.a} ${
                question.operation === "addition"
                  ? "+"
                  : question.operation === "subtraction"
                  ? "−"
                  : question.operation === "multiplication"
                  ? "×"
                  : "÷"
              } ${question.b}`
            : "",
          correct_answer: String(question.answer),
          user_answer: userAnswer.trim(),
          was_correct: isCorrect,
          ai_hint_used: hintUsedPerQuestion[currentQuestionIndex],
        },
      ]);

      if (error) {
        console.error("[practice-insert] ERROR", error);
        setFeedback({
          isCorrect: false,
          message: `Error saving attempt: ${error.message}`,
        });
      } else {
        console.log("[practice-insert] ok", { tier: tierId, was_correct: isCorrect });
        setFeedback({
          isCorrect,
          message: isCorrect ? "✓ Correct!" : `✗ Not quite. The answer is ${question.answer}.`,
        });

        const newAnswer: Answer = {
          questionIndex: currentQuestionIndex,
          userAnswer: userAnswer.trim(),
          isCorrect,
        };
        setAnswers([...answers, newAnswer]);
      }
    } catch (err) {
      console.error("[practice-insert] ERROR", err);
      setFeedback({
        isCorrect: false,
        message: "Error saving attempt",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTeachAcknowledged = () => {
    setTeachAcknowledged(true);
  };

  const handleNext = () => {
    setUserAnswer("");
    setFeedback(null);
    setCurrentHintLevel(0);
    setCurrentHint("");
    setMulStrategy(null);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleDone = async () => {
    if (!childId || !topic || !tierId) return;

    // Award stars
    if (answers.length === questions.length) {
      const correctCount = answers.filter((a) => a.isCorrect).length;
      const allCorrect = correctCount === questions.length;
      const starsDelta = correctCount * 2 + (allCorrect ? 5 : 0);

      console.log("[practice] awarding stars:", { correctCount, allCorrect, starsDelta });
      await addStars(childId, starsDelta);
    }

    // Re-run ability assessment to show outcome
    try {
      const { data: childData } = await supabase
        .from("children")
        .select("max_addition_number, max_times_table, math_subtraction_level, math_division_level")
        .eq("id", childId)
        .single();

      const { data: attemptData } = await supabase
        .from("learning_attempts")
        .select("tier, was_correct")
        .eq("child_id", childId)
        .eq("topic", topic)
        .not("tier", "is", null);

      const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
        tierId: row.tier,
        correct: row.was_correct,
      }));

      const { tierId: nextTierId, band, advanceReady } = currentTierAndBand(
        attempts,
        topic as Operation,
        childData || {}
      );

      setOutcomeBand(band);

      if (advanceReady) {
        // Find the next tier's label
        const ladder = LADDERS[topic as Operation];
        const nextTierObj = ladder.find((t) => t.id === nextTierId);
        const nextTierLabel = nextTierObj?.label || nextTierId;
        setOutcomeMessage(`Solid at ${tierLabel} — moving up to ${nextTierLabel}!`);
      } else if (band === "struggling") {
        setOutcomeMessage(`Let's keep working on ${tierLabel}.`);
      } else {
        setOutcomeMessage(`Nice progress on ${tierLabel}!`);
      }

      setSessionComplete(true);
    } catch (err) {
      console.error("[practice] outcome error:", err);
      setSessionComplete(true);
    }
  };

  // Teach screen removed — now handled by deterministic lesson screen at /lesson/[childId]

  if (isLoading || questions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const isSessionComplete = answers.length === questions.length;
  const score = answers.filter((a) => a.isCorrect).length;

  if (sessionComplete) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Session Complete!</Text>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{score} / {questions.length}</Text>
            <Text style={styles.scoreLabel}>correct</Text>
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryText}>{outcomeMessage}</Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={() => {
            router.push({
              pathname: "/child-home/[childId]",
              params: { childId },
            });
          }}>
            <Text style={styles.buttonText}>Back to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (isSessionComplete) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>All Done!</Text>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{score} / {questions.length}</Text>
            <Text style={styles.scoreLabel}>correct</Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleDone}>
            <Text style={styles.buttonText}>See Results</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const question = questions[currentQuestionIndex];
  const questionNumber = currentQuestionIndex + 1;
  const showingFeedback = feedback !== null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.progress}>
            Question {questionNumber} of {questions.length}
          </Text>
          <Text style={styles.tierLabel}>{tierLabel}</Text>

        <View style={styles.questionBox}>
          <Text style={styles.question}>
            {question.a} {
              question.operation === "addition" ? "+" :
              question.operation === "subtraction" ? "−" :
              question.operation === "multiplication" ? "×" :
              "÷"
            } {question.b} = ?
          </Text>
        </View>

        {/* Hint button and display (hidden if answer correct) */}
        {!showingFeedback && (
          <>
            {/* Button */}
            <TouchableOpacity
              style={[
                styles.hintButton,
                hintLoading && styles.hintButtonDisabled,
                currentHintLevel >= 2 && styles.hintButtonDisabled,
              ]}
              onPress={handleRequestHint}
              disabled={hintLoading || currentHintLevel >= 2}
            >
              {hintLoading ? (
                <ActivityIndicator size="small" color="#666" />
              ) : (
                <Text style={styles.hintButtonText}>
                  {currentHintLevel === 0
                    ? "Need a hint?"
                    : currentHintLevel === 1
                    ? "More help"
                    : "Hint shown"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Strategy hint display (fact tiers) */}
            {mulStrategy && (
              <View style={styles.hintContainer}>
                <StrategyView plan={mulStrategy} showStep2={currentHintLevel >= 2} />
              </View>
            )}

            {/* AI hint display for other operations */}
            {currentHint && !mulStrategy && (
              <View style={styles.hintContainer}>
                <Text style={styles.hintText}>{currentHint}</Text>
              </View>
            )}
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Enter your answer"
          keyboardType="number-pad"
          value={userAnswer}
          onChangeText={setUserAnswer}
          editable={!showingFeedback}
          maxLength={10}
        />

        {showingFeedback && (
          <View
            style={[
              styles.feedbackBox,
              feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, (isSubmitting || showingFeedback) && styles.buttonDisabled]}
          onPress={showingFeedback ? handleNext : handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>{showingFeedback ? "Next" : "Submit"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  progress: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  tierLabel: {
    fontSize: 12,
    color: "#2196f3",
    textAlign: "center",
    marginBottom: 24,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
    color: "#1a1a1a",
  },
  questionBox: {
    backgroundColor: "#f0f8ff",
    padding: 28,
    borderRadius: 12,
    marginBottom: 32,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  question: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  input: {
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    marginBottom: 20,
    textAlign: "center",
  },
  feedbackBox: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
  },
  feedbackCorrect: {
    backgroundColor: "#e8f5e9",
    borderLeftColor: "#4caf50",
  },
  feedbackWrong: {
    backgroundColor: "#ffebee",
    borderLeftColor: "#f44336",
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  introBox: {
    backgroundColor: "#f0f8ff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  introText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    lineHeight: 24,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  stepBox: {
    flexDirection: "row",
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fef9f0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    borderRadius: 6,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ff9800",
    marginRight: 12,
    minWidth: 24,
  },
  stepText: {
    fontSize: 14,
    color: "#1a1a1a",
    lineHeight: 20,
    flex: 1,
  },
  nudgeBox: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    marginVertical: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#999",
  },
  nudgeText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  scoreBox: {
    backgroundColor: "#f0f8ff",
    padding: 28,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  scoreText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#2196f3",
  },
  scoreLabel: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
  },
  summary: {
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  summaryText: {
    fontSize: 16,
    color: "#1a1a1a",
    textAlign: "center",
    lineHeight: 24,
  },
  hintButton: {
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  hintButtonDisabled: {
    opacity: 0.6,
  },
  hintButtonSecondary: {
    borderColor: "#2196f3",
    marginBottom: 0,
    marginTop: 12,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  hintContainer: {
    backgroundColor: "#fef9f0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  hintLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ff9800",
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  hintText: {
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
    marginBottom: 12,
  },
  hintEncouragement: {
    fontSize: 14,
    color: "#ff9800",
    fontStyle: "italic",
    marginTop: 8,
  },
  strategyLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2196f3",
    marginBottom: 12,
    textTransform: "capitalize",
  },
  visual: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    alignItems: "flex-start",
  },
  encouragement: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
  },
});
