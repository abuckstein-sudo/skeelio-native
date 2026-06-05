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
import { supabase } from "@/lib/supabase";
import { useAuth } from "../_layout";

interface Question {
  topic: string;
  skill: string;
  question_text: string;
  correct_answer: string;
  a: number;
  b: number;
}

interface Answer {
  questionIndex: number;
  userAnswer: string;
  isCorrect: boolean;
}

function generateQuestion(topic: string, questionIndex: number): Question {
  // Vary b across questions (0-7) -> b in range [1..8]
  const bValues = [1, 2, 3, 4, 5, 6, 7, 8];
  const b = bValues[questionIndex];

  if (topic === "addition") {
    // a + b, keep results small
    const a = Math.floor(Math.random() * 10) + 1;
    const result = a + b;
    return {
      topic,
      skill: `+${b}`,
      question_text: `${a} + ${b}`,
      correct_answer: `${result}`,
      a,
      b,
    };
  } else if (topic === "subtraction") {
    // a − b, with a >= b (never negative)
    const a = Math.floor(Math.random() * 10) + b;
    const result = a - b;
    return {
      topic,
      skill: `−${b}`,
      question_text: `${a} − ${b}`,
      correct_answer: `${result}`,
      a,
      b,
    };
  } else if (topic === "multiplication") {
    // a × b
    const a = Math.floor(Math.random() * 10) + 1;
    const result = a * b;
    return {
      topic,
      skill: `×${b}`,
      question_text: `${a} × ${b}`,
      correct_answer: `${result}`,
      a,
      b,
    };
  } else if (topic === "division") {
    // exact a ÷ b (a = b*q, integer result)
    const q = Math.floor(Math.random() * 9) + 1;
    const a = b * q;
    return {
      topic,
      skill: `÷${b}`,
      question_text: `${a} ÷ ${b}`,
      correct_answer: `${q}`,
      a,
      b,
    };
  }

  // Fallback (shouldn't reach here)
  return {
    topic,
    skill: "?",
    question_text: "?",
    correct_answer: "0",
    a: 0,
    b: 0,
  };
}

export default function PracticeScreen() {
  const router = useRouter();
  const { topic, childId } = useLocalSearchParams<{ topic: string; childId: string }>();
  const { session } = useAuth();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!topic || !childId || !session?.user?.id) {
      console.log("[practice] missing params or session");
      return;
    }

    if (topic === "word_problems") {
      // Word problems not implemented
      setIsLoading(false);
      return;
    }

    // Generate 8 questions for this session
    const qs: Question[] = [];
    for (let i = 0; i < 8; i++) {
      qs.push(generateQuestion(topic, i));
    }
    setQuestions(qs);
    setIsLoading(false);
  }, [topic, childId, session]);

  const handleSubmit = async () => {
    if (!userAnswer.trim() || !session?.user?.id || !childId || !topic) {
      return;
    }

    setIsSubmitting(true);
    const question = questions[currentQuestionIndex];
    const isCorrect = userAnswer.trim() === question.correct_answer;

    try {
      // Insert into learning_attempts
      const { error } = await supabase.from("learning_attempts").insert([
        {
          user_id: session.user.id,
          child_id: childId,
          subject: "math",
          topic: topic,
          skill: question.skill,
          question_text: question.question_text,
          correct_answer: question.correct_answer,
          user_answer: userAnswer.trim(),
          was_correct: isCorrect,
        },
      ]);

      if (error) {
        console.error("[practice-insert] ERROR", error);
        setFeedback({
          isCorrect: false,
          message: `Error saving attempt: ${error.message}`,
        });
      } else {
        console.log("[practice-insert] ok", { skill: question.skill, was_correct: isCorrect });
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
      console.error("[practice-insert] ERROR", err);
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
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleDone = () => {
    console.log("[practice] session complete, returning to home");
    router.push({
      pathname: "/child/[id]",
      params: { id: childId },
    });
  };

  if (isLoading || questions.length === 0) {
    if (topic === "word_problems") {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Word Problems</Text>
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>Coming soon!</Text>
            <Text style={styles.placeholderSubtext}>
              Word problem generation requires AI and is not yet available.
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleDone}>
            <Text style={styles.buttonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const isSessionComplete = answers.length === questions.length;
  const score = answers.filter((a) => a.isCorrect).length;

  if (isSessionComplete) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Session Complete!</Text>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{score} / 8</Text>
            <Text style={styles.scoreLabel}>correct</Text>
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {score === 8
                ? "Perfect! You nailed it! 🎉"
                : score >= 6
                ? "Great work! Keep practicing!"
                : score >= 4
                ? "Good effort. Practice makes perfect!"
                : "Keep going! You've got this!"}
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleDone}>
            <Text style={styles.buttonText}>Back to Home</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const question = questions[currentQuestionIndex];
  const questionNumber = currentQuestionIndex + 1;
  const showingFeedback = feedback !== null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.progress}>
          Question {questionNumber} of 8
        </Text>

        <View style={styles.questionBox}>
          <Text style={styles.question}>{question.question_text} = ?</Text>
        </View>

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
    marginBottom: 32,
    fontWeight: "500",
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
  placeholderBox: {
    backgroundColor: "#f9f9f9",
    padding: 32,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
});
