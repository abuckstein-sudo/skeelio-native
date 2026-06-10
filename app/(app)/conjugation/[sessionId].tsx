import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { addStars } from "@/lib/addStars";
import {
  fetchConjugationPool,
  pickRandomQuestions,
  shuffleOptions,
  createConjugationSession,
  recordConjugationAttempt,
  endConjugationSession,
  fetchTeachingExample,
  type ConjugationQuestion,
  type ConjugationSession,
  type TeachingPattern,
} from "@/lib/conjugation";

interface Answer {
  questionId: string;
  verb: string;
  tense: string;
  pronoun: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

type Screen = "selection" | "teaching" | "quiz" | "complete";

const TENSES = ["présent", "imparfait", "passé composé", "futur simple"];
const VERB_GROUPS = [
  { value: "groupe_1", label: "Groupe 1 (-er)" },
  { value: "groupe_2", label: "Groupe 2 (-ir)" },
  { value: "groupe_3", label: "Groupe 3 (-re)" },
  { value: "irregulier", label: "Irregular verbs" },
];

export default function ConjugationPracticeScreen() {
  const router = useRouter();
  const { sessionId, childId } = useLocalSearchParams<{
    sessionId: string;
    childId: string;
  }>();

  // Navigation
  const [screen, setScreen] = useState<Screen>("selection");

  // Selection state
  const [selectedTense, setSelectedTense] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectionError, setSelectionError] = useState<string>("");

  // Teaching state
  const [teachingPattern, setTeachingPattern] = useState<TeachingPattern | null>(null);
  const [isLoadingTeaching, setIsLoadingTeaching] = useState(false);

  // Quiz state
  const [questions, setQuestions] = useState<ConjugationQuestion[]>([]);
  const [session, setSession] = useState<ConjugationSession | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "correct" | "wrong";
    correctAnswer?: string;
  }>({ type: "idle" });
  const [correctCount, setCorrectCount] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = questions[currentIndex];

  const handleSelectOptions = async () => {
    if (!selectedTense || !selectedGroup) {
      setSelectionError("Please select both a tense and a verb group");
      return;
    }

    setIsLoadingTeaching(true);
    setSelectionError("");

    try {
      // Fetch child grade
      const { data: childData, error: childErr } = await supabase
        .from("children")
        .select("grade_level")
        .eq("id", childId)
        .single();

      if (childErr) throw childErr;
      const gradeLevel = childData?.grade_level || "CE1";

      // Fetch pool with filters
      const pool = await fetchConjugationPool(childId, gradeLevel, selectedTense, selectedGroup);

      if (pool.length === 0) {
        setSelectionError(`No questions found for ${selectedTense} + ${selectedGroup} at your level. Try another combination.`);
        setIsLoadingTeaching(false);
        return;
      }

      // Fetch teaching example
      const pattern = await fetchTeachingExample(selectedGroup, selectedTense);
      setTeachingPattern(pattern);
      setScreen("teaching");
    } catch (err) {
      console.error("[ConjugationPractice] selection failed:", err);
      setSelectionError("Failed to load questions");
    } finally {
      setIsLoadingTeaching(false);
    }
  };

  const handleStartQuiz = async () => {
    setIsLoadingQuiz(true);

    try {
      const { data: childData, error: childErr } = await supabase
        .from("children")
        .select("grade_level")
        .eq("id", childId)
        .single();

      if (childErr) throw childErr;
      const gradeLevel = childData?.grade_level || "CE1";

      // Fetch pool
      const pool = await fetchConjugationPool(childId, gradeLevel, selectedTense, selectedGroup);
      if (pool.length === 0) {
        setError("No questions available");
        setIsLoadingQuiz(false);
        return;
      }

      // Pick up to 10
      const picked = pickRandomQuestions(pool, 10);
      setQuestions(picked);

      // Create session (use existing one)
      const { data: sessions, error: sessErr } = await supabase
        .from("conjugation_practice_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessErr) throw sessErr;
      const sess = sessions;
      await supabase
        .from("conjugation_practice_sessions")
        .update({ total_items: picked.length })
        .eq("id", sessionId);

      setSession(sess);

      // Shuffle first question
      if (picked.length > 0) {
        const shuffled = shuffleOptions(picked[0].options, picked[0].correct_answer);
        setShuffledOptions(shuffled);
      }

      setScreen("quiz");
    } catch (err) {
      console.error("[ConjugationPractice] quiz start failed:", err);
      setError(String(err));
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleSelectOption = async (selectedOption: string) => {
    if (!currentQuestion || !session || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const isCorrect = selectedOption === currentQuestion.correct_answer;

      // Record attempt
      await recordConjugationAttempt(
        session.id,
        currentQuestion.id,
        childId,
        (await supabase.auth.getUser()).data.user?.id || "",
        selectedOption,
        currentQuestion.correct_answer,
        isCorrect
      );

      if (isCorrect) {
        setCorrectCount((c) => c + 1);
        setFeedback({ type: "correct" });
        await addStars(childId, 1);
      } else {
        setFeedback({ type: "wrong", correctAnswer: currentQuestion.correct_answer });
      }

      setAnswers([
        ...answers,
        {
          questionId: currentQuestion.id,
          verb: currentQuestion.verb,
          tense: currentQuestion.tense,
          pronoun: currentQuestion.pronoun,
          studentAnswer: selectedOption,
          correctAnswer: currentQuestion.correct_answer,
          isCorrect,
        },
      ]);
    } catch (err) {
      console.error("[ConjugationPractice] submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setFeedback({ type: "idle" });
      const shuffled = shuffleOptions(questions[nextIndex].options, questions[nextIndex].correct_answer);
      setShuffledOptions(shuffled);
    } else {
      // Session complete
      if (session) {
        const incorrectCount = questions.length - correctCount;
        await endConjugationSession(session.id, questions.length, correctCount, incorrectCount);
      }
      setScreen("complete");
    }
  };

  // SELECTION SCREEN
  if (screen === "selection") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Choose Your Practice</Text>

          <Text style={styles.label}>Tense</Text>
          <View style={styles.buttonGrid}>
            {TENSES.map((tense) => (
              <TouchableOpacity
                key={tense}
                style={[styles.selectButton, selectedTense === tense && styles.selectButtonActive]}
                onPress={() => setSelectedTense(tense)}
              >
                <Text style={[styles.selectButtonText, selectedTense === tense && styles.selectButtonTextActive]}>
                  {tense}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Verb Group</Text>
          <View style={styles.buttonGrid}>
            {VERB_GROUPS.map((group) => (
              <TouchableOpacity
                key={group.value}
                style={[styles.selectButton, selectedGroup === group.value && styles.selectButtonActive]}
                onPress={() => setSelectedGroup(group.value)}
              >
                <Text style={[styles.selectButtonText, selectedGroup === group.value && styles.selectButtonTextActive]}>
                  {group.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectionError && <Text style={styles.errorText}>{selectionError}</Text>}

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleSelectOptions}
            disabled={isLoadingTeaching}
          >
            {isLoadingTeaching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TEACHING SCREEN
  if (screen === "teaching" && teachingPattern) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Learn the Pattern</Text>

          <View style={styles.patternCard}>
            <Text style={styles.patternTitle}>
              {teachingPattern.tense} • {teachingPattern.group}
            </Text>

            <Text style={styles.patternSubtitle}>Endings:</Text>
            <View style={styles.endingsRow}>
              {teachingPattern.endings.map((ending, idx) => (
                <View key={idx} style={styles.endingBox}>
                  <Text style={styles.endingText}>{ending || "—"}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.patternSubtitle}>Example: {teachingPattern.example.verb}</Text>
            {teachingPattern.example.conjugations.map((conj, idx) => (
              <View key={idx} style={styles.conjugationRow}>
                <Text style={styles.pronounText}>{conj.pronoun}</Text>
                <Text style={styles.formText}>{conj.form}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleStartQuiz}
            disabled={isLoadingQuiz}
          >
            {isLoadingQuiz ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Start</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // QUIZ SCREEN
  if (screen === "quiz") {
    if (error) {
      return (
        <SafeAreaView style={styles.container}>
          <Text style={styles.error}>{error}</Text>
        </SafeAreaView>
      );
    }

    if (!currentQuestion) {
      return (
        <SafeAreaView style={styles.container}>
          <Text style={styles.error}>No questions available</Text>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.progress}>
            Question {currentIndex + 1} of {questions.length}
          </Text>
          <View style={styles.stars}>
            <Text style={styles.starsText}>⭐ {correctCount}</Text>
          </View>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.heading}>Conjugue : {currentQuestion.verb}</Text>
          <View style={styles.tenseBadge}>
            <Text style={styles.tenseBadgeText}>{currentQuestion.tense}</Text>
          </View>
          <Text style={styles.pronounText}>
            {currentQuestion.pronoun} <Text style={styles.blank}>_____</Text>
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {shuffledOptions.map((option, idx) => {
            const isCorrect = option === currentQuestion.correct_answer;
            const isSelected = feedback.type !== "idle" && option === feedback.correctAnswer;

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.optionButton,
                  feedback.type === "wrong" && isCorrect && styles.optionCorrect,
                  feedback.type === "wrong" && !isCorrect && isSelected && styles.optionWrong,
                ]}
                onPress={() => handleSelectOption(option)}
                disabled={feedback.type !== "idle" || isSubmitting}
              >
                <Text style={styles.optionText}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {feedback.type !== "idle" && (
          <View style={styles.feedbackContainer}>
            <Text style={[styles.feedbackText, feedback.type === "correct" ? styles.correct : styles.incorrect]}>
              {feedback.type === "correct" ? "✓ Correct!" : `✗ The answer is: ${feedback.correctAnswer}`}
            </Text>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>
                {currentIndex === questions.length - 1 ? "Finish" : "Next"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // COMPLETE SCREEN
  if (screen === "complete") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.endScreen}>
          <Text style={styles.endTitle}>Great job! 🎉</Text>
          <Text style={styles.endStat}>
            You got {correctCount} out of {questions.length} correct
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push(`/child-home/${childId}`)}
          >
            <Text style={styles.buttonText}>Back Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
    color: "#333",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  buttonGrid: {
    gap: 8,
    marginBottom: 24,
  },
  selectButton: {
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  selectButtonActive: {
    backgroundColor: "#e3f2fd",
    borderColor: "#2196f3",
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  selectButtonTextActive: {
    color: "#2196f3",
  },
  errorText: {
    fontSize: 14,
    color: "#f44336",
    marginBottom: 16,
    textAlign: "center",
  },
  patternCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
  },
  patternTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  patternSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
    color: "#666",
  },
  endingsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  endingBox: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#2196f3",
  },
  endingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2196f3",
  },
  conjugationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  pronounText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  formText: {
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 16,
  },
  progress: {
    fontSize: 14,
    color: "#666",
  },
  stars: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  starsText: {
    fontSize: 16,
    fontWeight: "600",
  },
  questionCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  tenseBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  tenseBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1976d2",
  },
  blank: {
    borderBottomWidth: 2,
    borderBottomColor: "#333",
    paddingHorizontal: 4,
  },
  optionsContainer: {
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  optionButton: {
    padding: 16,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  optionCorrect: {
    backgroundColor: "#c8e6c9",
    borderColor: "#4caf50",
  },
  optionWrong: {
    backgroundColor: "#ffcdd2",
    borderColor: "#f44336",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  feedbackContainer: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    gap: 12,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
  },
  correct: {
    color: "#4caf50",
  },
  incorrect: {
    color: "#f44336",
  },
  nextButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  endScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 16,
  },
  endTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  endStat: {
    fontSize: 18,
    color: "#666",
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    marginTop: 16,
  },
  buttonPrimary: {
    backgroundColor: "#007AFF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  error: {
    fontSize: 16,
    color: "#f44336",
    textAlign: "center",
  },
});
