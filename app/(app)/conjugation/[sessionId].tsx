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
  getLabelForVerbGroup,
  getLabelForTense,
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

type Screen = "loading" | "language" | "selection" | "teaching" | "quiz" | "complete";

type VerbGroupOption = { value: string; label: string };
type TenseOption = { value: string; label: string };

export default function ConjugationPracticeScreen() {
  const router = useRouter();
  const { sessionId, childId, assignmentId } = useLocalSearchParams<{
    sessionId: string;
    childId: string;
    assignmentId?: string;
  }>();

  // Navigation
  const [screen, setScreen] = useState<Screen>("loading");

  // Language state
  const [availableLanguages, setAvailableLanguages] = useState<Array<{ locale: string; name: string }>>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  // Selection state
  const [selectedTense, setSelectedTense] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectionError, setSelectionError] = useState<string>("");
  const [availableGroups, setAvailableGroups] = useState<VerbGroupOption[]>([]);
  const [availableTenses, setAvailableTenses] = useState<TenseOption[]>([]);

  // Assignment state
  const [assignmentFilters, setAssignmentFilters] = useState<{
    language: string;
    verb_groups: string[];
    tenses: string[];
    question_count: number;
  } | null>(null);

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

  // Initialize: check if assignment or free play
  useEffect(() => {
    const init = async () => {
      try {
        if (assignmentId) {
          // Load assignment filters and go straight to quiz
          const { data: assignmentData, error: assignErr } = await supabase
            .from("assignments")
            .select("*")
            .eq("id", assignmentId)
            .single();

          if (assignErr) throw assignErr;
          const cq = (assignmentData?.custom_questions as any) || {};
          setAssignmentFilters({
            language: cq.language || "fr-FR",
            verb_groups: cq.verb_groups || [],
            tenses: cq.tenses || [],
            question_count: assignmentData?.question_count || 10,
          });
          // Skip straight to loading quiz
          setScreen("loading");
          setTimeout(() => startQuizFromAssignment(cq.language || "fr-FR", cq.verb_groups || [], cq.tenses || [], assignmentData?.question_count || 10), 100);
        } else {
          // Free play: check child languages
          const { data: childData, error: childErr } = await supabase
            .from("children")
            .select("languages, preferred_language")
            .eq("id", childId)
            .single();

          if (childErr) throw childErr;

          const langs = (childData?.languages as any) || [];
          const langs_array = Array.isArray(langs) ? langs : (typeof langs === "string" ? JSON.parse(langs) : []);

          const languageMap: Record<string, { locale: string; name: string }> = {
            "French": { locale: "fr-FR", name: "French" },
            "English": { locale: "en-CA", name: "English" },
          };

          const available = langs_array
            .map((lang: string) => languageMap[lang])
            .filter(Boolean);

          setAvailableLanguages(available);

          if (available.length === 1) {
            // Only one language: skip to selection
            setSelectedLanguage(available[0].locale);
            await loadVerbGroupsAndTenses(available[0].locale);
            setScreen("selection");
          } else if (available.length > 1) {
            // Multiple languages: show selector
            setScreen("language");
          } else {
            // No languages found, default to French
            setSelectedLanguage("fr-FR");
            await loadVerbGroupsAndTenses("fr-FR");
            setScreen("selection");
          }
        }
      } catch (err) {
        console.error("[ConjugationPractice] init failed:", err);
        setError(String(err));
        setScreen("selection");
      }
    };

    init();
  }, []);

  const loadVerbGroupsAndTenses = async (language: string) => {
    try {
      console.log('[conj] selected language ->', selectedLanguage, 'resolved locale ->', language);

      // Fetch all questions for this language to find available groups and tenses
      const { data, error } = await supabase
        .from("conjugation_questions")
        .select("verb_group, tense")
        .eq("language", language);

      if (error) throw error;

      // Get unique values
      const uniqueGroups = new Set<string>();
      const uniqueTenses = new Set<string>();

      (data || []).forEach((q) => {
        uniqueGroups.add(q.verb_group);
        uniqueTenses.add(q.tense);
      });

      const groups = Array.from(uniqueGroups)
        .map((g) => ({
          value: g,
          label: getLabelForVerbGroup(g),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const tenses = Array.from(uniqueTenses)
        .map((t) => ({
          value: t,
          label: getLabelForTense(t),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      console.log('[conj] distinct verb_groups', groups, 'distinct tenses', tenses);

      setAvailableGroups(groups);
      setAvailableTenses(tenses);
    } catch (err) {
      console.error("[loadVerbGroupsAndTenses] failed:", err);
    }
  };

  const startQuizFromAssignment = async (language: string, groups: string[], tenses: string[], count: number) => {
    setIsLoadingQuiz(true);

    try {
      const { data: childData, error: childErr } = await supabase
        .from("children")
        .select("grade_level")
        .eq("id", childId)
        .single();

      if (childErr) throw childErr;
      const gradeLevel = childData?.grade_level || "CE1";

      // Fetch pool with assignment filters
      const pool = await fetchConjugationPool(childId, gradeLevel, tenses, groups, language);
      console.log('[conj] pool size (assignment)', pool.length);
      if (pool.length === 0) {
        setIsLoadingQuiz(false);
        setError("No questions available for this selection");
        return;
      }

      // Pick up to question count
      const picked = pickRandomQuestions(pool, count);
      setQuestions(picked);

      // Update session
      const { data: sessions, error: sessErr } = await supabase
        .from("conjugation_practice_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessErr) throw sessErr;
      await supabase
        .from("conjugation_practice_sessions")
        .update({ total_items: picked.length })
        .eq("id", sessionId);

      setSession(sessions);

      // Shuffle first question
      if (picked.length > 0) {
        const shuffled = shuffleOptions(picked[0].options, picked[0].correct_answer);
        setShuffledOptions(shuffled);
      }

      // Clear loading state BEFORE changing screen so quiz renders immediately
      setIsLoadingQuiz(false);
      setScreen("quiz");
    } catch (err) {
      console.error("[startQuizFromAssignment] failed:", err);
      setError(String(err));
      setIsLoadingQuiz(false);
    }
  };

  const handleSelectLanguage = async (locale: string) => {
    setSelectedLanguage(locale);
    await loadVerbGroupsAndTenses(locale);
    setScreen("selection");
  };

  const handleSelectOptions = async () => {
    if (!selectedTense || !selectedGroup) {
      setSelectionError("Please select both a tense and a verb group");
      return;
    }

    setIsLoadingTeaching(true);
    setSelectionError("");

    try {
      const { data: childData, error: childErr } = await supabase
        .from("children")
        .select("grade_level")
        .eq("id", childId)
        .single();

      if (childErr) throw childErr;
      const gradeLevel = childData?.grade_level || "CE1";

      // Fetch pool with filters - pass selectedLanguage
      const pool = await fetchConjugationPool(childId, gradeLevel, selectedTense, selectedGroup, selectedLanguage);

      if (pool.length === 0) {
        setSelectionError(`No questions found for ${selectedTense} + ${selectedGroup} at your level. Try another combination.`);
        setIsLoadingTeaching(false);
        return;
      }

      // Fetch teaching example
      const pattern = await fetchTeachingExample(selectedGroup, selectedTense, selectedLanguage);
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

      // Fetch pool with filters - pass selectedLanguage
      console.log('[conj] passing groups', JSON.stringify(selectedGroup), 'tenses', JSON.stringify(selectedTense), 'locale', selectedLanguage);
      const pool = await fetchConjugationPool(childId, gradeLevel, selectedTense, selectedGroup, selectedLanguage);
      console.log('[conj] pool size', pool.length);

      if (pool.length === 0) {
        setIsLoadingQuiz(false);
        setSelectionError("No questions available for this selection. Try different options.");
        setScreen("selection");
        return;
      }

      // Pick up to 10
      const picked = pickRandomQuestions(pool, 10);
      setQuestions(picked);

      // Update session
      const { data: sessions, error: sessErr } = await supabase
        .from("conjugation_practice_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessErr) throw sessErr;
      await supabase
        .from("conjugation_practice_sessions")
        .update({ total_items: picked.length })
        .eq("id", sessionId);

      setSession(sessions);

      // Shuffle first question
      if (picked.length > 0) {
        const shuffled = shuffleOptions(picked[0].options, picked[0].correct_answer);
        setShuffledOptions(shuffled);
      }

      // Clear loading state BEFORE changing screen so quiz renders immediately
      setIsLoadingQuiz(false);
      setScreen("quiz");
    } catch (err) {
      console.error("[ConjugationPractice] quiz start failed:", err);
      setError(String(err));
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

      // Mark assignment complete if this is from homework
      if (assignmentId) {
        try {
          const { markAssignmentComplete } = await import("@/lib/assignments");
          await markAssignmentComplete(assignmentId);
        } catch (err) {
          console.error("[ConjugationPractice] failed to mark assignment complete:", err);
        }
      }

      setScreen("complete");
    }
  };

  // LANGUAGE SELECTION SCREEN
  if (screen === "language") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Choose Language</Text>

          <View style={styles.buttonGrid}>
            {availableLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.locale}
                style={[styles.selectButton, selectedLanguage === lang.locale && styles.selectButtonActive]}
                onPress={() => handleSelectLanguage(lang.locale)}
              >
                <Text style={[styles.selectButtonText, selectedLanguage === lang.locale && styles.selectButtonTextActive]}>
                  {lang.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // SELECTION SCREEN
  if (screen === "selection") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Choose Your Practice</Text>

          <Text style={styles.label}>Tense</Text>
          <View style={styles.buttonGrid}>
            {availableTenses.map((tense) => (
              <TouchableOpacity
                key={tense.value}
                style={[styles.selectButton, selectedTense === tense.value && styles.selectButtonActive]}
                onPress={() => setSelectedTense(tense.value)}
              >
                <Text style={[styles.selectButtonText, selectedTense === tense.value && styles.selectButtonTextActive]}>
                  {tense.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Verb Group</Text>
          <View style={styles.buttonGrid}>
            {availableGroups.map((group) => (
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
  if (screen === "teaching") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Learn the Pattern</Text>

          {teachingPattern && (
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
          )}

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

  // LOADING SCREEN
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
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
