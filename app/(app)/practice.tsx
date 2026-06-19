import { useEffect, useRef, useState } from "react";
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
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { addStars } from "@/lib/addStars";
import { generateQuestion, pickTeachExample } from "@/lib/tutor/generate";
import { currentTierAndBand, Attempt, tierStats, isSolidTierStat } from "@/lib/tutor/ability";
import { LADDERS, GATE, Operation, FACT_TIERS } from "@/lib/tutorConfig";
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
import QuitButton from "@/components/QuitButton";
import { appLanguageForChild, AppLanguage } from "@/lib/appLanguage";

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

const COPY = {
  en: {
    sessionComplete: "Session Complete!",
    allDone: "All Done!",
    correct: "correct",
    backHome: "Back to Home",
    question: "Question",
    of: "of",
    hintFirst: "Need a hint?",
    hintMore: "More help",
    hintShown: "Hint shown",
    placeholder: "Enter your answer",
    submit: "Submit",
    next: "Next",
    correctFeedback: "✓ Correct!",
    saveError: "Error saving attempt",
    wrongFeedback: (answer: number | string) => `✗ Not quite. The answer is ${answer}.`,
    keepWorking: (tier: string) => `Let's keep working on ${tier}.`,
    niceProgress: (tier: string) => `Nice progress on ${tier}!`,
    movingUp: (tier: string, nextTier: string) => `Solid at ${tier} — moving up to ${nextTier}!`,
  },
  fr: {
    sessionComplete: "Séance terminée !",
    allDone: "Terminé !",
    correct: "correctes",
    backHome: "Retour à l'accueil",
    question: "Question",
    of: "sur",
    hintFirst: "Besoin d'un indice ?",
    hintMore: "Encore de l'aide",
    hintShown: "Indice affiché",
    placeholder: "Écris ta réponse",
    submit: "Valider",
    next: "Suivant",
    correctFeedback: "✓ Correct !",
    saveError: "Erreur pendant l'enregistrement",
    wrongFeedback: (answer: number | string) => `✗ Pas tout à fait. La réponse est ${answer}.`,
    keepWorking: (tier: string) => `On continue à travailler : ${tier}.`,
    niceProgress: (tier: string) => `Beau progrès sur ${tier} !`,
    movingUp: (tier: string, nextTier: string) => `Solide sur ${tier} — on passe à ${nextTier} !`,
  },
} as const;

export default function PracticeScreen() {
  const router = useRouter();
  const { topic, childId, lessonShown } = useLocalSearchParams<{ topic: string; childId: string; lessonShown?: string }>();
  const { session } = useAuth();
  const inputRef = useRef<TextInput>(null);

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
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
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
  const [outcomeBand, setOutcomeBand] = useState<"solid" | "developing" | "struggling" | "needs-teach">("developing");

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
        const appLang = appLanguageForChild(childData);
        const language = appLang === "fr" ? "French" : "English";
        setChildLanguage(language);
        setAppLanguage(appLang);

        // Fetch attempt log for this operation
        const { data: attemptData, error: attemptError } = await supabase
          .from("learning_attempts")
          .select("tier, question_text, was_correct, ai_hint_used, evidence_source")
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
          questionText: row.question_text,
          evidenceSource: row.evidence_source,
        }));

        // Get current tier and band
        const tierAndBandResult = currentTierAndBand(
          attempts,
          topic as Operation,
          childData || {}
        );
        const { tierId: workingTierId, band, advanceReady } = tierAndBandResult;

        // DEBUG: Log Roger's actual values (remove after diagnosis)
        if (childId === "0b266a82-ec3c-4156-9c11-f954a3874a25" && topic === "multiplication") {
          console.log("\n========== ROGER'S MULTIPLICATION RUNTIME ==========");
          console.log("1) CHILD DATA");
          console.log(`   max_times_table: ${childData?.max_times_table}`);

          console.log("\n2) CURRENT TIER AND BAND (return values)");
          console.log(`   workingTier: ${workingTierId}`);
          console.log(`   band: ${band}`);
          console.log(`   advanceReady: ${advanceReady}`);

          console.log("\n4) ATTEMPT FILTERING & MATCHING");
          console.log(`   Total attempts: ${attempts.length}`);
          const tierCounts: Record<string, number> = {};
          attempts.forEach((a) => {
            tierCounts[a.tierId] = (tierCounts[a.tierId] || 0) + 1;
          });
          console.log(`   Attempts per tier:`);
          LADDERS.multiplication.forEach((tier) => {
            console.log(`     ${tier.id}: ${tierCounts[tier.id] || 0} attempts`);
          });

          console.log("\n3) PER-TIER STATISTICS (M1..M7)");
          const stats = tierStats(attempts);
          console.log(`   Tier | Total | Unaided✓ | Unaided# | Mastery% | Solid?`);
          console.log(`   -----|-------|----------|----------|----------|--------`);
          LADDERS.multiplication.forEach((tier) => {
            const stat = stats[tier.id];
            if (stat) {
              const isSolid = isSolidTierStat(stat);
              const masteryPct = (stat.masteryRate * 100).toFixed(1);
              const solidStr = isSolid ? "YES" : "NO";
              console.log(
                `   ${tier.id}   | ${String(stat.attempts).padStart(5)} | ${String(stat.unaided_correct).padStart(8)} | ${String(stat.unaided_attempts).padStart(8)} | ${String(masteryPct).padStart(8)} | ${solidStr}`
              );
            } else {
              console.log(`   ${tier.id}   | 0     | 0        | 0        | 0.0      | NO`);
            }
          });
          console.log("========== END DEBUG ==========\n");
        }

        // Find tier label
        const ladder = LADDERS[topic as Operation];
        const tierObj = ladder.find((t) => t.id === workingTierId);
        const label = tierObj?.label || workingTierId;

        setTierId(workingTierId);
        setTierLabel(label);

        // Check attempt count for this tier
        const tierAttempts = attemptData?.filter((a: any) => a.tier === workingTierId) || [];

        // If first time at this tier AND not returning from lesson, route to lesson for teaching
        // lessonShown param prevents infinite loop: after lesson completes, don't route back to lesson
        if (tierAttempts.length === 0 && !lessonShown) {
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
          question.remainder,
          appLanguage
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
          evidence_source: "adaptive_practice",
        },
      ]);

      if (error) {
        console.error("[practice-insert] ERROR", error);
        setFeedback({
          isCorrect: false,
          message: `${COPY[appLanguage].saveError}: ${error.message}`,
        });
      } else {
        console.log("[practice-insert] ok", { tier: tierId, was_correct: isCorrect });
        setFeedback({
          isCorrect,
          message: isCorrect ? COPY[appLanguage].correctFeedback : COPY[appLanguage].wrongFeedback(question.answer),
        });
        setTimeout(() => inputRef.current?.focus(), 50);

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
        message: COPY[appLanguage].saveError,
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
      setTimeout(() => inputRef.current?.focus(), 50);
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
        .select("tier, question_text, was_correct, ai_hint_used, evidence_source")
        .eq("child_id", childId)
        .eq("topic", topic)
        .not("tier", "is", null);

      const attempts: Attempt[] = (attemptData || []).map((row: any) => ({
        tierId: row.tier,
        correct: row.was_correct,
        hintUsed: row.ai_hint_used || false,
        questionText: row.question_text,
        evidenceSource: row.evidence_source,
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
        setOutcomeMessage(COPY[appLanguage].movingUp(tierLabel, nextTierLabel));
      } else if (band === "struggling") {
        setOutcomeMessage(COPY[appLanguage].keepWorking(tierLabel));
      } else {
        setOutcomeMessage(COPY[appLanguage].niceProgress(tierLabel));
      }

      setSessionComplete(true);
    } catch (err) {
      console.error("[practice] outcome error:", err);
      setSessionComplete(true);
    }
  };

  // Teach screen removed — now handled by deterministic lesson screen at /lesson/[childId]

  const isSessionComplete = questions.length > 0 && answers.length === questions.length;
  const score = answers.filter((a) => a.isCorrect).length;
  const copy = COPY[appLanguage];

  useEffect(() => {
    if (isSessionComplete && !sessionComplete) {
      handleDone();
    }
  }, [isSessionComplete, sessionComplete]);

  if (isLoading || questions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (sessionComplete) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>{copy.sessionComplete}</Text>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{score} / {questions.length}</Text>
            <Text style={styles.scoreLabel}>{copy.correct}</Text>
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
            <Text style={styles.buttonText}>{copy.backHome}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (isSessionComplete) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>{copy.allDone}</Text>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{score} / {questions.length}</Text>
            <Text style={styles.scoreLabel}>{copy.correct}</Text>
          </View>
          <ActivityIndicator size="small" color="#2196f3" />
        </ScrollView>
      </View>
    );
  }

  const question = questions[currentQuestionIndex];
  const questionNumber = currentQuestionIndex + 1;
  const showingFeedback = feedback !== null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <QuitButton />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Zone 1: Scrollable content (question + hint) — flex: 1 */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onPress={() => Keyboard.dismiss()}
        >
          <Text style={styles.progress}>
            {copy.question} {questionNumber} {copy.of} {questions.length}
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
                      ? copy.hintFirst
                      : currentHintLevel === 1
                      ? copy.hintMore
                      : copy.hintShown}
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
        </ScrollView>

        {/* Zone 2: Fixed footer (input + button) — outside ScrollView, above keyboard */}
        <View style={styles.footer}>
          <TextInput
            style={styles.input}
            placeholder={copy.placeholder}
            keyboardType="number-pad"
            value={userAnswer}
            onChangeText={setUserAnswer}
            editable={!isSubmitting}
            maxLength={10}
            ref={inputRef}
            autoFocus={true}
            showSoftInputOnFocus={true}
            blurOnSubmit={false}
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

          {showingFeedback && (
            <TouchableOpacity style={styles.nextAboveButton} onPress={handleNext}>
              <Text style={styles.nextAboveButtonText}>{copy.next}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || showingFeedback}
          >
            <Text style={styles.buttonText}>{copy.submit}</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
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
    marginBottom: 12,
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
    marginBottom: 0,
  },
  nextAboveButton: {
    backgroundColor: "#4caf50",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  nextAboveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
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
