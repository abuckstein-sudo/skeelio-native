import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setAudioModeAsync } from "expo-audio";
import { supabase } from "@/lib/supabase";
import { addStars } from "@/lib/addStars";
import { markAssignmentComplete } from "@/lib/assignments";
import QuitButton from "@/components/QuitButton";
import HandwritingAnswerPad from "@/components/HandwritingAnswerPad";
import { appLanguageForChild, AppLanguage } from "@/lib/appLanguage";
import {
  speakWord,
  speakSentence,
  generateSentence,
  updateItemSentence,
  getListWithItems,
  createSpellingSession,
  recordSpellingAttempt,
  endSpellingSession,
  gradeSpellingAttempt,
  fallbackHint,
  normalise,
  type SpellingItem,
  type SpellingLanguage,
  type SpellingSession,
} from "@/lib/spelling";
import { SPELLING_LADDER, SpellingStrand, SpellingTierId } from "@/lib/spellingConfig";
import { fetchSpellingCurriculumPool } from "@/lib/tutor/spellingCurriculum";
import { fetchSpellingAttemptsForChild } from "@/lib/tutor/spellingAttempts";

type PracticeItem = SpellingItem & {
  source?: "list" | "curriculum";
};

interface Answer {
  itemId: string | null;
  itemText: string;
  userAnswer: string;
  isCorrect: boolean;
  attemptNumber: number;
}

const COPY = {
  en: {
    listNotFound: "List not found",
    noWords: "This list has no words",
    failedLoad: "Failed to load list",
    goBack: "Go Back",
    greatJob: "Great job!",
    scoreLabel: (total: number) => `of ${total} correct on first try`,
    stars: "stars",
    backHome: "Back to Home",
    listen: "Listen and spell",
    hearAgain: "Hear it again",
    sentence: "Sentence",
    attempt: (attempt: number) => `Attempt ${attempt} of 3`,
    correct: "Correct!",
    reveal: "The word is",
    placeholder: "Type the word...",
    type: "Type",
    write: "Write",
    check: "Check",
    finish: "Finish",
    next: "Next",
    of: "of",
  },
  fr: {
    listNotFound: "Liste introuvable",
    noWords: "Cette liste n'a pas de mots",
    failedLoad: "Impossible de charger la liste",
    goBack: "Retour",
    greatJob: "Bravo !",
    scoreLabel: (total: number) => `sur ${total} corrects du premier coup`,
    stars: "étoiles",
    backHome: "Retour à l'accueil",
    listen: "Écoute et écris",
    hearAgain: "Réécouter",
    sentence: "Phrase",
    attempt: (attempt: number) => `Essai ${attempt} sur 3`,
    correct: "Correct !",
    reveal: "Le mot est",
    placeholder: "Écris le mot...",
    type: "Taper",
    write: "Écrire",
    check: "Valider",
    finish: "Terminer",
    next: "Suivant",
    of: "sur",
  },
} as const;

export default function SpellingPracticeScreen() {
  const router = useRouter();
  const { listId, childId, assignmentId, mode, tierId, strand, tierLabel } = useLocalSearchParams<{
    listId: string;
    childId: string;
    assignmentId?: string;
    mode?: "practice" | "quiz" | "teach";
    tierId?: SpellingTierId;
    strand?: SpellingStrand;
    tierLabel?: string;
  }>();

  const [listTitle, setListTitle] = useState("");
  const [language, setLanguage] = useState<SpellingLanguage>("English");
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [spellingSession, setSpellingSession] = useState<SpellingSession | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "hint" | "correct" | "reveal";
    text: string;
  }>({ type: "idle", text: "" });
  const [correctCount, setCorrectCount] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isSentenceLoading, setIsSentenceLoading] = useState(false);
  const [answerInputMode, setAnswerInputMode] = useState<"type" | "write">("type");
  const [hasUsedHint, setHasUsedHint] = useState(false);

  const inputRef = useRef<TextInput>(null);

  // Configure audio to play in silent mode (iOS)
  useEffect(() => {
    const configureAudio = async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        console.log("[SpellingPracticeScreen] audio mode configured for silent mode");
      } catch (err) {
        console.error("[SpellingPracticeScreen] audio mode setup failed:", err);
      }
    };
    configureAudio();
  }, []);

  // Load list and items
  useEffect(() => {
    const isTierMode = Boolean(tierId && strand);
    if (!childId || (!isTierMode && !listId)) return;

    const loadList = async () => {
      try {
        console.log("[SpellingPracticeScreen] loading list:", listId, "child:", childId, "assignmentId:", assignmentId, "tierId:", tierId);
        const { data: childData } = await supabase
          .from("children")
          .select("languages, preferred_language")
          .eq("id", childId)
          .single();
        const childAppLanguage = appLanguageForChild(childData);
        setAppLanguage(childAppLanguage);

        if (tierId && strand) {
          const tier = SPELLING_LADDER.find((candidate) => candidate.id === tierId && candidate.strand === strand);
          if (!tier) {
            setError(COPY[childAppLanguage].listNotFound);
            setIsLoading(false);
            return;
          }

          const [pool, previousAttempts] = await Promise.all([
            fetchSpellingCurriculumPool({ tierIds: [tierId], language: "fr-FR" }),
            fetchSpellingAttemptsForChild(childId),
          ]);

          if (pool.length === 0) {
            setError(COPY[childAppLanguage].noWords);
            setIsLoading(false);
            return;
          }

          const unaidedCorrectWords = new Set(
            previousAttempts
              .filter((attempt) =>
                attempt.tierId === tierId &&
                attempt.strand === strand &&
                !attempt.aided &&
                Boolean(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct)
              )
              .map((attempt) => normalise(attempt.word))
          );
          const orderedPool = [...pool].sort((a, b) => {
            const aCovered = unaidedCorrectWords.has(normalise(a.word)) ? 1 : 0;
            const bCovered = unaidedCorrectWords.has(normalise(b.word)) ? 1 : 0;
            return aCovered - bCovered || a.frequency - b.frequency;
          });
          const selectedItems: PracticeItem[] = orderedPool.slice(0, 10).map((word, index) => ({
            id: word.id,
            list_id: null,
            item_text: word.word,
            item_order: index,
            language: "French",
            user_id: null,
            student_id: childId,
            normalized_text: normalise(word.word),
            sentence: word.sentence ?? undefined,
            source: "curriculum",
          }));

          setListTitle(tierLabel || tier.label);
          setLanguage("French");
          setItems(selectedItems);

          const sess = await createSpellingSession(childId, null, selectedItems.length);
          setSpellingSession(sess);

          setTimeout(() => {
            console.log("[SpellingPracticeScreen] speaking first curriculum word:", selectedItems[0].item_text);
            speakWord(selectedItems[0].item_text, "French");
          }, 250);

          setIsLoading(false);
          return;
        }

        const data = await getListWithItems(listId);
        if (!data) {
          setError(COPY[childAppLanguage].listNotFound);
          setIsLoading(false);
          return;
        }

        console.log("[SpellingPracticeScreen] list items count:", data.items.length);

        if (data.items.length === 0) {
          setError(COPY[childAppLanguage].noWords);
          setIsLoading(false);
          return;
        }

        setListTitle(data.list.title);
        setLanguage(data.list.language);
        setItems(data.items.map((item) => ({ ...item, source: "list" })));

        // Create session
        const sess = await createSpellingSession(
          childId,
          listId,
          data.items.length
        );
        setSpellingSession(sess);

        // Speak first word
        setTimeout(() => {
          console.log("[SpellingPracticeScreen] speaking first word:", data.items[0].item_text);
          speakWord(data.items[0].item_text, data.list.language);
        }, 250);

        setIsLoading(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : COPY[appLanguage].failedLoad;
        setError(msg);
        setIsLoading(false);
      }
    };

    loadList();
  }, [listId, childId, tierId, strand, tierLabel]);

  const currentItem = items[currentIndex];

  const handleReplay = async () => {
    if (currentItem) {
      console.log("[handleReplay] speaking word:", currentItem.item_text);
      await speakWord(currentItem.item_text, language);
    }
  };

  const handleSentence = async () => {
    if (!currentItem || isSentenceLoading) return;

    setIsSentenceLoading(true);

    try {
      let sentence = currentItem.sentence;

      // If sentence is cached, speak it directly
      if (sentence) {
        console.log("[handleSentence] speaking cached sentence");
        await speakSentence(sentence, language);
      } else {
        // Generate sentence from OpenAI
        console.log("[handleSentence] generating sentence for:", currentItem.item_text);
        sentence = await generateSentence(currentItem.item_text, language);

        // Speak the generated sentence immediately (don't wait for cache)
        await speakSentence(sentence, language);

        // Cache asynchronously in background (fire-and-forget)
        // This never blocks audio playback
        updateItemSentence(currentItem.id, sentence).catch((err) => {
          console.error("[handleSentence] cache failed (non-blocking):", err);
        });

        // Update local state optimistically so next tap uses cache
        items[currentIndex].sentence = sentence;
      }
    } catch (error) {
      console.error("[handleSentence] error:", error);
      // Silently fail - don't interrupt the user's practice
    } finally {
      setIsSentenceLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentItem || !spellingSession || !childId || isSubmitting) return;

    const given = userAnswer.trim();
    if (!given) return;

    setIsSubmitting(true);
    try {
      const { is_correct, error_type } = gradeSpellingAttempt(
        currentItem.item_text,
        given,
        language
      );

      // Record attempt
      const aided = hasUsedHint || feedback.type === "hint";
      await recordSpellingAttempt(
        spellingSession.id,
        currentItem.source === "curriculum" ? null : currentItem.id,
        childId,
        currentItem.source === "curriculum" ? null : listId,
        currentItem.item_text,
        given,
        is_correct,
        attemptNumber,
        aided
      );

      if (is_correct) {
        // Only count first-attempt correct
        if (attemptNumber === 1) {
          setCorrectCount((c) => c + 1);
        }
        setFeedback({ type: "correct", text: currentItem.item_text });
        setAnswers([
          ...answers,
          {
            itemId: currentItem.id,
            itemText: currentItem.item_text,
            userAnswer: given,
            isCorrect: true,
            attemptNumber,
          },
        ]);
      } else {
        // Wrong answer
        if (mode === "quiz") {
          // In quiz mode, reveal immediately on any wrong answer
          setFeedback({ type: "reveal", text: currentItem.item_text });
          setAnswers([
            ...answers,
            {
              itemId: currentItem.id,
              itemText: currentItem.item_text,
              userAnswer: given,
              isCorrect: false,
              attemptNumber,
            },
          ]);
        } else if (attemptNumber < 3) {
          // Show hint - keep the user's answer visible so they can compare and edit
          const hint = fallbackHint(error_type, attemptNumber as 1 | 2, language);
          setFeedback({ type: "hint", text: hint });
          setHasUsedHint(true);
          setAttemptNumber((n) => (n + 1) as 1 | 2 | 3);
          // DO NOT clear setUserAnswer("") — keep their typed text visible for comparison
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          // Reveal after 3rd attempt
          setFeedback({ type: "reveal", text: currentItem.item_text });
          setAnswers([
            ...answers,
            {
              itemId: currentItem.id,
              itemText: currentItem.item_text,
              userAnswer: given,
              isCorrect: false,
              attemptNumber,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("[spelling-submit] error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    const isLast = currentIndex + 1 >= items.length;

    if (isLast) {
      // End session
      if (spellingSession && !childId) {
        throw new Error("Missing childId");
      }

      const finalCorrect = correctCount;
      if (spellingSession && childId) {
        await endSpellingSession(
          spellingSession.id,
          items.length,
          finalCorrect,
          items.length - finalCorrect
        );

        // Mark assignment complete if this is homework
        if (assignmentId) {
          await markAssignmentComplete(assignmentId, {
            correctCount: finalCorrect,
            totalCount: items.length,
          });
        }

        // Award stars
        if (finalCorrect > 0) {
          await addStars(childId, finalCorrect);
        }
      }

      setSessionComplete(true);
    } else {
      // Next word
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setAttemptNumber(1);
      setHasUsedHint(false);
      setUserAnswer("");
      setFeedback({ type: "idle", text: "" });

      setTimeout(() => {
        speakWord(items[nextIndex].item_text, language);
        inputRef.current?.focus();
      }, 200);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (error) {
    const copy = COPY[appLanguage];
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>{copy.goBack}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sessionComplete) {
    const total = items.length;
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>{copy.greatJob}</Text>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{correctCount}</Text>
            <Text style={styles.scoreLabel}>
              {copy.scoreLabel(total)}
            </Text>
          </View>
          <View style={styles.starsBox}>
            <Text style={styles.starsText}>⭐ +{correctCount} {copy.stars}</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push({ pathname: "/child-home/[childId]", params: { childId } })}
          >
            <Text style={styles.buttonText}>{copy.backHome}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currentItem) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const progressPercent = Math.round(
    ((currentIndex + 1) / items.length) * 100
  );
  const awaitingTap =
    feedback.type === "correct" || feedback.type === "reveal";
  const copy = COPY[appLanguage];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <QuitButton />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Zone 1: Scrollable content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onPress={() => Keyboard.dismiss()}
        >
          <Text style={styles.progress}>
            {currentIndex + 1} {copy.of} {items.length}
          </Text>
          <Text style={styles.listTitle}>{listTitle}</Text>
          <Text style={styles.languageLabel}>{language}</Text>

          <View style={styles.questionBox}>
            <Text style={styles.instructionText}>{copy.listen}</Text>

            {/* Hear-it-again and sentence buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.speakButton}
                onPress={handleReplay}
                disabled={isSubmitting}
              >
                <Text style={styles.speakButtonText}>🔊 {copy.hearAgain}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.speakButton, isSentenceLoading && styles.speakButtonLoading]}
                onPress={handleSentence}
                disabled={isSubmitting || isSentenceLoading}
              >
                <Text style={styles.speakButtonText}>
                  {isSentenceLoading ? "..." : `🔊 ${copy.sentence}`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Feedback display */}
            {feedback.type === "hint" && (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>💡 {feedback.text}</Text>
                <Text style={styles.attemptText}>{copy.attempt(attemptNumber)}</Text>
              </View>
            )}

            {feedback.type === "correct" && (
              <View style={styles.correctBox}>
                <Text style={styles.correctEmoji}>⭐</Text>
                <Text style={styles.correctText}>{copy.correct}</Text>
                <Text style={styles.correctWord}>{feedback.text}</Text>
              </View>
            )}

            {feedback.type === "reveal" && (
              <View style={styles.revealBox}>
                <Text style={styles.revealEmoji}>📚</Text>
                <Text style={styles.revealLabel}>{copy.reveal}</Text>
                <Text style={styles.revealWord}>{feedback.text}</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Zone 2: Fixed footer with input and button */}
        <View style={styles.footer}>
          {!awaitingTap && (
            <>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={copy.placeholder}
                value={userAnswer}
                onChangeText={setUserAnswer}
                onSubmitEditing={handleSubmit}
                autoCorrect={false}
                autoCapitalize="none"
                spellCheck={false}
                editable={!isSubmitting}
                maxLength={50}
                autoFocus={true}
                showSoftInputOnFocus={answerInputMode === "type"}
                blurOnSubmit={false}
              />
              <View style={styles.inputModeRow}>
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
              {answerInputMode === "write" && (
                <HandwritingAnswerPad
                  language={appLanguage}
                  questionText={currentItem.item_text}
                  onRecognized={setUserAnswer}
                />
              )}

              <TouchableOpacity
                style={[
                  styles.button,
                  (!userAnswer.trim() || isSubmitting) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!userAnswer.trim() || isSubmitting}
              >
                <Text style={styles.buttonText}>
                  {isSubmitting ? "..." : copy.check}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {awaitingTap && (
            <TouchableOpacity
              style={styles.button}
              onPress={handleNext}
            >
              <Text style={styles.buttonText}>
                {currentIndex + 1 >= items.length ? copy.finish : copy.next}
              </Text>
            </TouchableOpacity>
          )}
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  progress: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "500",
  },
  listTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 4,
  },
  languageLabel: {
    fontSize: 12,
    color: "#2196f3",
    textAlign: "center",
    marginBottom: 24,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  questionBox: {
    backgroundColor: "#f0f8ff",
    padding: 28,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  instructionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    width: "100%",
  },
  speakButton: {
    flex: 1,
    backgroundColor: "#e3f2fd",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#2196f3",
  },
  speakButtonLoading: {
    opacity: 0.6,
  },
  speakButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
    textAlign: "center",
  },
  hintBox: {
    backgroundColor: "#fef9f0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
    marginBottom: 8,
    fontWeight: "500",
  },
  attemptText: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  correctBox: {
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  correctEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  correctText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4caf50",
    marginBottom: 8,
  },
  correctWord: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  revealBox: {
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#999",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  revealEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  revealLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  revealWord: {
    fontSize: 20,
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
  inputModeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  inputModeButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  inputModeButtonActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  inputModeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  inputModeButtonTextActive: {
    color: "#1d4ed8",
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 0,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
    color: "#1a1a1a",
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
    textAlign: "center",
  },
  starsBox: {
    backgroundColor: "#fff3e0",
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
  },
  starsText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ff9800",
  },
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    marginBottom: 20,
    textAlign: "center",
  },
});
