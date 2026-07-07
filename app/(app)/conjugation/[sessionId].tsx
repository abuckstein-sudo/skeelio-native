import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../_layout";
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
import QuitButton from "@/components/QuitButton";
import HandwritingAnswerPad from "@/components/HandwritingAnswerPad";
import { appLanguageForChild, AppLanguage } from "@/lib/appLanguage";
import { CONJUGATION_LADDER, ConjugationTier, ConjugationTierId } from "@/lib/conjugationConfig";
import { fetchConjugationAttemptsForChild } from "@/lib/tutor/conjugationAttempts";

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
type QuestionAnswerMode = "choice" | "input";
type AnswerInputMode = "type" | "write";

const COPY = {
  en: {
    chooseLanguage: "Choose Language",
    choosePractice: "Choose Your Practice",
    tense: "Tense",
    verbGroup: "Verb Group",
    continue: "Continue",
    learnPattern: "Learn the Pattern",
    endings: "Endings:",
    example: "Example:",
    start: "Start",
    noQuestions: "No questions available",
    question: "Question",
    of: "of",
    conjugate: "Conjugate:",
    correct: "✓ Correct!",
    wrong: (answer?: string) => `✗ The answer is: ${answer}`,
    finish: "Finish",
    next: "Next",
    greatJob: "Great job! 🎉",
    got: (correct: number, total: number) => `You got ${correct} out of ${total} correct`,
    backHome: "Back Home",
    selectBoth: "Please select both a tense and a verb group",
    failedLoad: "Failed to load questions",
    loading: "Loading...",
    choose: "Choose",
    write: "Write",
    check: "Check",
    recognizedAnswer: "Your answer",
    inputType: "Answer with",
    keyboard: "Keyboard",
    handwriting: "Handwriting",
  },
  fr: {
    chooseLanguage: "Choisis la langue",
    choosePractice: "Choisis ton entraînement",
    tense: "Temps",
    verbGroup: "Groupe de verbes",
    continue: "Continuer",
    learnPattern: "Apprends le modèle",
    endings: "Terminaisons :",
    example: "Exemple :",
    start: "Commencer",
    noQuestions: "Aucune question disponible",
    question: "Question",
    of: "sur",
    conjugate: "Conjugue :",
    correct: "✓ Correct !",
    wrong: (answer?: string) => `✗ La réponse est : ${answer}`,
    finish: "Terminer",
    next: "Suivant",
    greatJob: "Bravo ! 🎉",
    got: (correct: number, total: number) => `Tu as ${correct} bonnes réponses sur ${total}`,
    backHome: "Retour à l'accueil",
    selectBoth: "Choisis un temps et un groupe de verbes",
    failedLoad: "Impossible de charger les questions",
    loading: "Chargement...",
    choose: "Choisir",
    write: "Écrire",
    check: "Valider",
    recognizedAnswer: "Ta réponse",
    inputType: "Répondre avec",
    keyboard: "Clavier",
    handwriting: "Écriture",
  },
} as const;

function questionModeForTier(tier: ConjugationTier | null, questionIndex: number): QuestionAnswerMode {
  if (!tier || tier.answerMode === "input") return "input";
  // Beginner tiers scaffold most prompts with choices, then regularly ask for production.
  return (questionIndex + 1) % 3 === 0 ? "input" : "choice";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message?: unknown }).message);
  return String(err);
}

export default function ConjugationPracticeScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const { session: authSession } = useAuth();
  const { sessionId, childId, assignmentId, tierId, mode } = useLocalSearchParams<{
    sessionId: string;
    childId: string;
    assignmentId?: string;
    tierId?: string;
    mode?: string;
  }>();

  // Navigation
  const [screen, setScreen] = useState<Screen>("loading");

  // Language state
  const [availableLanguages, setAvailableLanguages] = useState<Array<{ locale: string; name: string }>>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");

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
  const [freePlayAnswerMode, setFreePlayAnswerMode] = useState<QuestionAnswerMode>("choice");
  const [answerInputMode, setAnswerInputMode] = useState<AnswerInputMode>("type");
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [isWritingStroke, setIsWritingStroke] = useState(false);

  const currentQuestion = questions[currentIndex];
  const currentTier = tierId ? CONJUGATION_LADDER.find((candidate) => candidate.id === tierId) ?? null : null;
  const authUserId = authSession?.user?.id;

  const pickTierQuestions = async (
    pool: ConjugationQuestion[],
    tier: ConjugationTier,
    count: number
  ): Promise<ConjugationQuestion[]> => {
    try {
      const attempts = await fetchConjugationAttemptsForChild(childId);
      const coveredPronouns = new Set<string>();
      const coveredVerbs = new Set<string>();

      attempts.forEach((attempt) => {
        const matchesTier = attempt.tense === tier.tense && tier.verbGroups.includes(attempt.verb_group as any);
        if (!matchesTier || attempt.aided || !(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct)) return;
        coveredPronouns.add(attempt.pronoun);
        coveredVerbs.add(attempt.verb);
      });

      const scored = [...pool].sort((a, b) => {
        const aScore = (coveredPronouns.has(a.pronoun) ? 0 : 2) + (coveredVerbs.has(a.verb) ? 0 : 1);
        const bScore = (coveredPronouns.has(b.pronoun) ? 0 : 2) + (coveredVerbs.has(b.verb) ? 0 : 1);
        return bScore - aScore;
      });

      return scored.slice(0, Math.min(count, scored.length));
    } catch (err) {
      console.error("[ConjugationPractice] coverage-aware tier pick failed:", err);
      return pickRandomQuestions(pool, count);
    }
  };

  // Initialize: check if assignment or free play
  useEffect(() => {
    const init = async () => {
      try {
        if (!authUserId) throw new Error("Please sign in again before practising.");

        if (tierId) {
          setAppLanguage("fr");
          await startQuizFromTier(tierId as ConjugationTierId);
        } else if (assignmentId) {
          // Load assignment filters and go straight to quiz
          const { data: assignmentData, error: assignErr } = await supabase
            .from("assignments")
            .select("*")
            .eq("id", assignmentId)
            .single();

          if (assignErr) throw assignErr;
          const cq = (assignmentData?.custom_questions as any) || {};
          setFreePlayAnswerMode("input");
          setAppLanguage((cq.language || "fr-FR") === "fr-FR" ? "fr" : "en");
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
          setAppLanguage(appLanguageForChild(childData));

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
        setError(errorMessage(err));
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
      setError(errorMessage(err));
      setIsLoadingQuiz(false);
    }
  };

  const startQuizFromTier = async (requestedTierId: ConjugationTierId) => {
    setIsLoadingQuiz(true);

    try {
      const tier = CONJUGATION_LADDER.find((candidate) => candidate.id === requestedTierId);
      if (!tier) throw new Error(`Unknown conjugation tier ${requestedTierId}`);

      const { data: childData, error: childErr } = await supabase
        .from("children")
        .select("grade_level")
        .eq("id", childId)
        .single();

      if (childErr) throw childErr;
      const gradeLevel = childData?.grade_level || "CE1";

      const pool = await fetchConjugationPool(childId, gradeLevel, tier.tense, tier.verbGroups, "fr-FR");
      if (pool.length === 0) {
        setIsLoadingQuiz(false);
        setError("No questions available for this conjugation level");
        return;
      }

      const picked = await pickTierQuestions(pool, tier, 10);
      setQuestions(picked);

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

      if (picked.length > 0) {
        const shuffled = shuffleOptions(picked[0].options, picked[0].correct_answer);
        setShuffledOptions(shuffled);
      }

      setSelectedLanguage("fr-FR");
      setSelectedTense(tier.tense);
      setSelectedGroup(tier.verbGroups[0] || "");
      setIsLoadingQuiz(false);
      setScreen("quiz");
    } catch (err) {
      console.error("[startQuizFromTier] failed:", err);
      setError(errorMessage(err));
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
      setSelectionError(COPY[appLanguage].selectBoth);
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
        setSelectionError(COPY[appLanguage].failedLoad);
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
      setError(errorMessage(err));
      setIsLoadingQuiz(false);
    }
  };

  const handleSelectOption = async (selectedOption: string, aided = false) => {
    if (!currentQuestion || !session || isSubmitting) return;
    if (!authUserId) {
      setError("Please sign in again before practising.");
      return;
    }

    setIsSubmitting(true);
    try {
      const isCorrect = selectedOption === currentQuestion.correct_answer;

      // Record attempt
      await recordConjugationAttempt(
        session.id,
        currentQuestion.id,
        childId,
        authUserId,
        selectedOption,
        currentQuestion.correct_answer,
        isCorrect,
        aided
      );

      if (isCorrect) {
        setCorrectCount((c) => c + 1);
        setFeedback({ type: "correct" });
        await addStars(childId, 1, authUserId);
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

  const handleSubmitWrittenAnswer = () => {
    const answer = writtenAnswer.trim();
    if (!answer || feedback.type !== "idle" || isSubmitting) return;
    handleSelectOption(answer, false);
  };

  const focusAnswerInput = () => {
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  useEffect(() => {
    if (screen !== "quiz" || answerInputMode !== "type" || feedback.type !== "idle" || isSubmitting) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [answerInputMode, currentIndex, feedback.type, isSubmitting, screen]);

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setFeedback({ type: "idle" });
      setWrittenAnswer("");
      const shuffled = shuffleOptions(questions[nextIndex].options, questions[nextIndex].correct_answer);
      setShuffledOptions(shuffled);
    } else {
      // Session complete
      if (session) {
        if (!authUserId) {
          setError("Please sign in again before practising.");
          return;
        }
        const incorrectCount = questions.length - correctCount;
        await endConjugationSession(session.id, questions.length, correctCount, incorrectCount);
      }

      // Mark assignment complete if this is from homework
      if (assignmentId) {
        try {
          const { markAssignmentComplete } = await import("@/lib/assignments");
          await markAssignmentComplete(assignmentId, {
            correctCount,
            totalCount: questions.length,
          });
        } catch (err) {
          console.error("[ConjugationPractice] failed to mark assignment complete:", err);
        }
      }

      setScreen("complete");
    }
  };

  // LANGUAGE SELECTION SCREEN
  if (screen === "language") {
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container}>
        <QuitButton />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{copy.chooseLanguage}</Text>

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
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container}>
        <QuitButton />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{copy.choosePractice}</Text>

          <Text style={styles.label}>{copy.tense}</Text>
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

          <Text style={styles.label}>{copy.verbGroup}</Text>
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
              <Text style={styles.buttonText}>{copy.continue}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TEACHING SCREEN
  if (screen === "teaching") {
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container}>
        <QuitButton />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{copy.learnPattern}</Text>

          {teachingPattern && (
            <View style={styles.patternCard}>
              <Text style={styles.patternTitle}>
                {teachingPattern.tense} • {teachingPattern.group}
              </Text>

              <Text style={styles.patternSubtitle}>{copy.endings}</Text>
              <View style={styles.endingsRow}>
                {teachingPattern.endings.map((ending, idx) => (
                  <View key={idx} style={styles.endingBox}>
                    <Text style={styles.endingText}>{ending || "—"}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.patternSubtitle}>{copy.example} {teachingPattern.example.verb}</Text>
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
              <Text style={styles.buttonText}>{copy.start}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // QUIZ SCREEN
  if (screen === "quiz") {
    const copy = COPY[appLanguage];
    const forceWriteMode = Boolean(assignmentId);
    const isTierMode = Boolean(tierId);
    const effectiveAnswerMode: QuestionAnswerMode = forceWriteMode
      ? "input"
      : isTierMode
        ? questionModeForTier(currentTier, currentIndex)
        : freePlayAnswerMode;
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
          <Text style={styles.error}>{copy.noQuestions}</Text>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <QuitButton />
        <ScrollView
          contentContainerStyle={styles.quizScrollContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isWritingStroke}
        >
          <View style={styles.header}>
            <Text style={styles.progress}>
              {copy.question} {currentIndex + 1} {copy.of} {questions.length}
            </Text>
            <View style={styles.stars}>
              <Text style={styles.starsText}>⭐ {correctCount}</Text>
            </View>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.heading}>{copy.conjugate} {currentQuestion.verb}</Text>
            <View style={styles.tenseBadge}>
              <Text style={styles.tenseBadgeText}>{currentQuestion.tense}</Text>
            </View>
            <Text style={styles.pronounText}>
              {currentQuestion.pronoun} <Text style={styles.blank}>_____</Text>
            </Text>
          </View>

          {!forceWriteMode && !isTierMode && (
            <View style={styles.answerModeRow}>
              <TouchableOpacity
                style={[styles.answerModeButton, freePlayAnswerMode === "choice" && styles.answerModeButtonActive]}
                onPress={() => setFreePlayAnswerMode("choice")}
              >
                <Text style={[styles.answerModeButtonText, freePlayAnswerMode === "choice" && styles.answerModeButtonTextActive]}>{copy.choose}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.answerModeButton, freePlayAnswerMode === "input" && styles.answerModeButtonActive]}
                onPress={() => setFreePlayAnswerMode("input")}
              >
                <Text style={[styles.answerModeButtonText, freePlayAnswerMode === "input" && styles.answerModeButtonTextActive]}>{copy.write}</Text>
              </TouchableOpacity>
            </View>
          )}

          {effectiveAnswerMode === "choice" ? (
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
                  onPress={() => handleSelectOption(option, true)}
                  disabled={feedback.type !== "idle" || isSubmitting}
                >
                  <Text style={styles.optionText}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          ) : (
            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={[styles.input, answerInputMode === "type" && styles.inputTyping]}
                value={writtenAnswer}
                onChangeText={setWrittenAnswer}
                placeholder={copy.recognizedAnswer}
                placeholderTextColor="#94a3b8"
                editable={feedback.type === "idle" && !isSubmitting}
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={answerInputMode === "type"}
              />
              {feedback.type === "idle" && (
                <View style={styles.inputModeRow}>
                  <Text style={styles.inputModeLabel}>{copy.inputType}</Text>
                  <TouchableOpacity
                    style={[styles.inputModeButton, answerInputMode === "type" && styles.inputModeButtonActive]}
                    onPress={() => {
                      setAnswerInputMode("type");
                      focusAnswerInput();
                    }}
                  >
                    <Text style={[styles.inputModeButtonText, answerInputMode === "type" && styles.inputModeButtonTextActive]}>
                      {copy.keyboard}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inputModeButton, answerInputMode === "write" && styles.inputModeButtonActive]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setAnswerInputMode("write");
                    }}
                  >
                    <Text style={[styles.inputModeButtonText, answerInputMode === "write" && styles.inputModeButtonTextActive]}>
                      {copy.handwriting}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {feedback.type === "idle" && (
                answerInputMode === "write" && (
                  <View style={styles.handwritingBox}>
                    <HandwritingAnswerPad
                      language={appLanguage}
                      questionText={`${currentQuestion.pronoun} ${currentQuestion.verb} ${currentQuestion.tense}`}
                      onRecognized={setWrittenAnswer}
                      onDrawingChange={setIsWritingStroke}
                    />
                  </View>
                )
              )}
              {feedback.type === "idle" && (
                <TouchableOpacity
                  style={[styles.submitWrittenButton, (!writtenAnswer.trim() || isSubmitting) && styles.submitWrittenButtonDisabled]}
                  onPress={handleSubmitWrittenAnswer}
                  disabled={!writtenAnswer.trim() || isSubmitting}
                >
                  <Text style={styles.submitWrittenButtonText}>{copy.check}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {feedback.type !== "idle" && (
            <View style={styles.feedbackContainer}>
              <Text style={[styles.feedbackText, feedback.type === "correct" ? styles.correct : styles.incorrect]}>
                {feedback.type === "correct" ? copy.correct : copy.wrong(feedback.correctAnswer)}
              </Text>
              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
              >
                <Text style={styles.nextButtonText}>
                  {currentIndex === questions.length - 1 ? copy.finish : copy.next}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // COMPLETE SCREEN
  if (screen === "complete") {
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.endScreen}>
          <Text style={styles.endTitle}>{copy.greatJob}</Text>
          <Text style={styles.endStat}>
            {copy.got(correctCount, questions.length)}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push(`/child-home/${childId}`)}
          >
            <Text style={styles.buttonText}>{copy.backHome}</Text>
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
        <Text style={styles.loadingText}>{COPY[appLanguage].loading}</Text>
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
  quizScrollContent: {
    paddingBottom: 32,
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
    paddingRight: 16,
    paddingLeft: 56,
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
  answerModeRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  answerModeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  answerModeButtonActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  answerModeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  answerModeButtonTextActive: {
    color: "#1d4ed8",
  },
  optionsContainer: {
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  inputContainer: {
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 24,
  },
  input: {
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 18,
    color: "#111827",
    backgroundColor: "#fff",
  },
  inputTyping: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  inputModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  inputModeLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "700",
  },
  inputModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  inputModeButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },
  inputModeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  inputModeButtonTextActive: {
    color: "#1d4ed8",
  },
  handwritingBox: {
    borderRadius: 8,
    overflow: "hidden",
  },
  submitWrittenButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  submitWrittenButtonDisabled: {
    opacity: 0.55,
  },
  submitWrittenButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
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
