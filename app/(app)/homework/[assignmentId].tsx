import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../_layout";
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
import { appLanguageForChild, AppLanguage } from "@/lib/appLanguage";
import QuitButton from "@/components/QuitButton";
import HandwritingAnswerPad from "@/components/HandwritingAnswerPad";

interface Answer {
  questionIndex: number;
  userAnswer: string;
  isCorrect: boolean;
}

const COPY = {
  en: {
    loadingHint: "Loading...",
    hint: "Hint",
    howTo: "Here's how to solve it:",
    correct: "✓ Correct!",
    wrong: (answer: string) => `✗ Not quite. The answer is ${answer}.`,
    assignmentComplete: "Assignment complete!",
    completionSubtitle: "Nice work finishing your homework.",
    correctLabel: "correct",
    stars: "stars",
    backHome: "Back home",
    noQuestions: "No questions available",
    back: "Back",
    quizMode: "Quiz mode — no hints available",
    answerPlaceholder: "Your answer",
    inputType: "Answer type",
    type: "Type",
    write: "Write",
    check: "Check",
    finish: "Finish",
    finishing: "Finishing...",
    next: "Next",
    completeError: "Error completing assignment",
    practice: "Practice",
    quiz: "Quiz",
  },
  fr: {
    loadingHint: "Chargement...",
    hint: "Indice",
    howTo: "Voici comment résoudre :",
    correct: "✓ Correct !",
    wrong: (answer: string) => `✗ Pas tout à fait. La réponse est ${answer}.`,
    assignmentComplete: "Devoir terminé !",
    completionSubtitle: "Bravo, tu as fini ton devoir.",
    correctLabel: "correctes",
    stars: "étoiles",
    backHome: "Retour à l'accueil",
    noQuestions: "Aucune question disponible",
    back: "Retour",
    quizMode: "Mode quiz — pas d'indice",
    answerPlaceholder: "Ta réponse",
    inputType: "Type de réponse",
    type: "Taper",
    write: "Écrire",
    check: "Valider",
    finish: "Terminer",
    finishing: "Finalisation...",
    next: "Suivant",
    completeError: "Erreur pendant la fin du devoir",
    practice: "Entraînement",
    quiz: "Quiz",
  },
} as const;

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

function normalizeCustomQuestions(value: unknown): CustomQuestion[] {
  return Array.isArray(value)
    ? value.filter((question): question is CustomQuestion => {
        const candidate = question as Partial<CustomQuestion>;
        return (
          typeof candidate?.question_text === "string" &&
          typeof candidate?.correct_answer === "string" &&
          typeof candidate?.subject === "string" &&
          typeof candidate?.topic === "string"
        );
      })
    : [];
}

export default function HomeworkScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { assignmentId, childId } = useLocalSearchParams<{ assignmentId: string; childId: string }>();
  const inputRef = useRef<TextInput>(null);

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
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
  const [answerInputMode, setAnswerInputMode] = useState<"type" | "write">("type");

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

    if (assignment.subject === "spelling") {
      const listId = (assignment.custom_questions as any)?.list_id;
      if (listId) {
        router.replace({
          pathname: "/spelling/[listId]",
          params: { listId, childId, assignmentId, mode: assignment.mode || "practice" },
        });
        return;
      }
    }

    setAssignment(assignment);
    if (childId) {
      const { data: childData } = await supabase
        .from("children")
        .select("languages, preferred_language")
        .eq("id", childId)
        .single();
      setAppLanguage(appLanguageForChild(childData));
    }
    const qs = normalizeCustomQuestions(assignment.custom_questions);
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
        const steps = computeExampleSteps(topic, a, b, undefined, appLanguage);

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

          setCurrentHint(`${COPY[appLanguage].howTo}\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
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
          evidence_source: "assigned_homework",
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
          message: isCorrect ? COPY[appLanguage].correct : COPY[appLanguage].wrong(question.correct_answer),
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
      setTimeout(() => inputRef.current?.focus(), 50);
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
        await addStars(childId, correctCount, session?.user?.id);
      }

      console.log("[homework] assignment completed, stars awarded:", correctCount);
      setCompletionStats({
        correct: correctCount,
        total: questions.length,
        stars: correctCount,
      });
    } catch (err) {
      console.error("[homework] completion error:", err);
      setError(COPY[appLanguage].completeError);
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
        <Text style={styles.errorText}>{error || COPY[appLanguage].noQuestions}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push({ pathname: "/child-home/[childId]", params: { childId } })}
        >
          <Text style={styles.backButtonText}>{COPY[appLanguage].back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const question = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isAnswered = feedback !== null;
  const canShowHint = !isQuizMode && currentHintLevel < 2 && !isAnswered;
  const showingStrategy = mulStrategy !== null && !isAnswered;
  const copy = COPY[appLanguage];

  const sessionCorrect = answers.filter((a) => a.isCorrect).length;
  const correctCount = restoredCorrect + sessionCorrect;
  const wrongCount = restoredAnswered - restoredCorrect + (answers.length - sessionCorrect);
  const headerTitle =
    (assignment.focus
      ? assignment.focus.charAt(0).toUpperCase() + assignment.focus.slice(1)
      : copy.practice) + (isQuizMode ? ` ${copy.quiz}` : ` ${copy.practice}`);

  if (completionStats) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completionContainer}>
          <Text style={styles.completionConfetti}>🎉</Text>
          <Text style={styles.completionTitle}>{copy.assignmentComplete}</Text>
          <Text style={styles.completionSubtitle}>{copy.completionSubtitle}</Text>
          <View style={styles.completionScoreBox}>
            <Text style={styles.completionScore}>
              {completionStats.correct} / {completionStats.total}
            </Text>
            <Text style={styles.completionScoreLabel}>{copy.correctLabel}</Text>
          </View>
          <View style={styles.completionStarsBox}>
            <Text style={styles.completionStarsText}>⭐ +{completionStats.stars} {copy.stars}</Text>
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
            <Text style={styles.completionButtonText}>{copy.backHome}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <QuitButton />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        {/* Zone 1: Scrollable content (question + hint) — flex: 1 */}
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Progress */}
          <View style={styles.header}>
            <Text style={styles.progressText}>
              {currentQuestionIndex + 1} {appLanguage === "fr" ? "sur" : "of"} {questions.length}
            </Text>
            <Text style={styles.tierLabel}>{headerTitle}</Text>
            <View style={styles.tally}>
              <Text style={styles.tallyCorrect}>{"✓"} {correctCount}</Text>
              <Text style={styles.tallyWrong}>{"✗"} {wrongCount}</Text>
            </View>
            {isQuizMode && <Text style={styles.quizModeText}>{copy.quizMode}</Text>}
          </View>

          {/* Question */}
          <View style={styles.questionContainer}>
            <View style={styles.questionBox}>
              <Text style={styles.questionText}>{question.question_text}</Text>
            </View>

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
                {hintLoading ? copy.loadingHint : currentHintLevel === 0 ? `💡 ${copy.hint}` : `💡 ${copy.hint} ${currentHintLevel}`}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Zone 2: Fixed footer (input + button) — outside ScrollView, above keyboard */}
        <View style={styles.footer}>
          <TextInput
            style={[styles.answerInput, answerInputMode === "write" && styles.answerInputRecognized]}
            placeholder={copy.answerPlaceholder}
            value={userAnswer}
            onChangeText={setUserAnswer}
            keyboardType={question.question_type === "numeric" ? "number-pad" : "default"}
            editable={!isSubmitting}
            ref={inputRef}
            autoFocus={true}
            showSoftInputOnFocus={answerInputMode === "type"}
            blurOnSubmit={false}
          />
          <View style={styles.inputModeRow}>
            <Text style={styles.inputModeLabel}>{copy.inputType}</Text>
            <TouchableOpacity
              style={[styles.inputModeButton, answerInputMode === "type" && styles.inputModeButtonActive]}
              onPress={() => setAnswerInputMode("type")}
            >
              <Text style={[styles.inputModeButtonText, answerInputMode === "type" && styles.inputModeButtonTextActive]}>
                {copy.type}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inputModeButton, answerInputMode === "write" && styles.inputModeButtonActive]}
              onPress={() => setAnswerInputMode("write")}
            >
              <Text style={[styles.inputModeButtonText, answerInputMode === "write" && styles.inputModeButtonTextActive]}>
                {copy.write}
              </Text>
            </TouchableOpacity>
          </View>
          {answerInputMode === "write" && !isAnswered && (
            <HandwritingAnswerPad
              language={appLanguage}
              questionText={question.question_text}
              onRecognized={setUserAnswer}
            />
          )}

          {/* Feedback */}
          {feedback && (
            <View
              style={[styles.feedbackBox, feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}
            >
              <Text style={styles.feedbackText}>{feedback.message}</Text>
            </View>
          )}

          {isAnswered && (
            <TouchableOpacity
              style={[styles.nextAboveButton, isCompleting && styles.nextButtonDisabled]}
              onPress={handleNext}
              disabled={isCompleting}
            >
              <Text style={styles.nextAboveButtonText}>
                {isCompleting ? copy.finishing : isLastQuestion ? copy.finish : copy.next}
              </Text>
            </TouchableOpacity>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.checkButton} onPress={handleSubmit} disabled={isSubmitting || isAnswered}>
                <Text style={styles.checkButtonText}>{isSubmitting ? "..." : copy.check}</Text>
              </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 40,
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
    alignItems: "center",
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
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  tierLabel: {
    fontSize: 12,
    color: "#2196f3",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
    textTransform: "uppercase",
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
  questionBox: {
    backgroundColor: "#f0f8ff",
    padding: 28,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  questionText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
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
  answerInputRecognized: {
    backgroundColor: "#f8fafc",
  },
  inputModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  inputModeLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginRight: "auto",
  },
  inputModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  inputModeButtonActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  inputModeButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  inputModeButtonTextActive: {
    color: "#1d4ed8",
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
  nextAboveButton: {
    backgroundColor: "#4caf50",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  nextAboveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
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
