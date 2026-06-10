import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
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
  type ConjugationQuestion,
  type ConjugationSession,
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

export default function ConjugationPracticeScreen() {
  const router = useRouter();
  const { sessionId, childId } = useLocalSearchParams<{
    sessionId: string;
    childId: string;
  }>();

  const [questions, setQuestions] = useState<ConjugationQuestion[]>([]);
  const [session, setSession] = useState<ConjugationSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const [sessionComplete, setSessionComplete] = useState(false);

  // Load questions and create session
  useEffect(() => {
    if (!childId || !sessionId) return;

    const loadSession = async () => {
      try {
        setIsLoading(true);
        console.log("[ConjugationPractice] loading session:", sessionId);

        // Fetch child info
        const { data: childData, error: childErr } = await supabase
          .from("children")
          .select("grade_level")
          .eq("id", childId)
          .single();

        if (childErr) throw childErr;
        const gradeLevel = childData?.grade_level || "CE1";

        // Fetch conjugation pool
        const pool = await fetchConjugationPool(childId, gradeLevel);
        if (pool.length === 0) {
          setError("No conjugation questions available");
          setIsLoading(false);
          return;
        }

        // Pick 10 random questions
        const picked = pickRandomQuestions(pool, 10);
        setQuestions(picked);

        // Create session
        const sess = await createConjugationSession(childId, (await supabase.auth.getUser()).data.user?.id || "", picked.length);
        setSession(sess);

        // Shuffle options for first question
        if (picked.length > 0) {
          const shuffled = shuffleOptions(picked[0].options, picked[0].correct_answer);
          setShuffledOptions(shuffled);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("[ConjugationPractice] load failed:", err);
        setError(String(err));
        setIsLoading(false);
      }
    };

    loadSession();
  }, [childId, sessionId]);

  const currentQuestion = questions[currentIndex];

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
        currentQuestion.pronoun,
        currentQuestion.verb,
        currentQuestion.tense,
        selectedOption,
        currentQuestion.correct_answer,
        isCorrect,
        1
      );

      if (isCorrect) {
        setCorrectCount((c) => c + 1);
        setFeedback({ type: "correct" });
        // Award stars
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
      // Shuffle options for next question
      const shuffled = shuffleOptions(questions[nextIndex].options, questions[nextIndex].correct_answer);
      setShuffledOptions(shuffled);
    } else {
      // Session complete
      if (session) {
        await endConjugationSession(session.id, questions.length, correctCount, questions.length - correctCount);
      }
      setSessionComplete(true);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (sessionComplete) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  pronounText: {
    fontSize: 20,
    fontWeight: "500",
    color: "#333",
  },
  blank: {
    borderBottomWidth: 2,
    borderBottomColor: "#333",
    paddingHorizontal: 4,
  },
  optionsContainer: {
    gap: 12,
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
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    fontSize: 16,
    color: "#f44336",
    textAlign: "center",
  },
});
