import { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, SafeAreaView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { markAssignmentComplete, Assignment, CustomQuestion } from "@/lib/assignments";
import { addStars } from "@/lib/addStars";
import { FACT_TIERS, LADDERS, Operation } from "@/lib/tutorConfig";
import { computeExampleSteps } from "@/lib/tutor/steps";

interface Answer {
  questionIndex: number;
  userAnswer: string;
  isCorrect: boolean;
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

    const assignment = data as Assignment;
    setAssignment(assignment);
    setQuestions(assignment.custom_questions || []);
    setIsLoading(false);
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
          ai_hint_used: false,
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

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    if (!assignmentId || !childId) return;

    try {
      // Mark assignment as complete
      await markAssignmentComplete(assignmentId);

      // Award stars: 1 star per correct answer
      const correctCount = answers.filter((a) => a.isCorrect).length;
      if (correctCount > 0) {
        await addStars(childId, correctCount);
      }

      console.log("[homework] assignment completed, stars awarded:", correctCount);

      // Navigate back to child home
      router.push({
        pathname: "/child-home/[childId]",
        params: { childId },
      });
    } catch (err) {
      console.error("[homework] completion error:", err);
      setError("Error completing assignment");
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {assignment.focus ? assignment.focus.charAt(0).toUpperCase() + assignment.focus.slice(1) : "Practice"}{" "}
            Assignment
          </Text>
          <Text style={styles.progressText}>
            {currentQuestionIndex + 1} of {questions.length}
          </Text>
        </View>

        {/* Question */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{question.question_text}</Text>
          <TextInput
            style={[styles.answerInput, isAnswered && styles.answerInputDisabled]}
            placeholder="Your answer"
            value={userAnswer}
            onChangeText={setUserAnswer}
            keyboardType="numeric"
            editable={!isAnswered}
          />
        </View>

        {/* Feedback */}
        {feedback && (
          <View style={[styles.feedbackBox, feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
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
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>{isLastQuestion ? "Finish" : "Next"}</Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  questionContainer: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 16,
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
  feedbackBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
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
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    marginBottom: 20,
    textAlign: "center",
  },
});
