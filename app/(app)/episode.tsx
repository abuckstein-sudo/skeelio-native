import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { addStars } from "@/lib/addStars";
import { SKILL_SESSION } from "@/lib/masteryConfig";
import { drawPlurals } from "@/lib/grammarBank";

interface SubSkill {
  label: string;
  description: string;
}

interface Concept {
  label: string;
  description: string;
  sub_skills: SubSkill[];
}

interface PracticeItem {
  kind: "math" | "reference";
  answer_type?: "number" | "yesno";
  unit?: "€" | "";
  sub_skill: string;
  question: string;
  answer: string | number | boolean;
  expected_answer?: string;
  verified: boolean;
  hint?: {
    title?: string;
    visual_rows?: {
      label?: string;
      c?: number | string;
      d?: number | string;
      u?: number | string;
      value?: number;
    }[];
    steps?: string[];
  };
}

interface EpisodeData {
  concept: Concept;
  lesson: string;
  grade_band: string;
  language: string;
  domain: "math" | "language";
}

type Phase = "lesson" | "practice" | "feedback";

export default function EpisodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse episode data from route params
  const [episodeData, setEpisodeData] = useState<EpisodeData | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [unaidedStreakMax, setUnaidedStreakMax] = useState(0);
  const [phase, setPhase] = useState<Phase>("lesson");

  // Practice queue
  const [practiceQueue, setPracticeQueue] = useState<PracticeItem[]>([]);
  const [currentItem, setCurrentItem] = useState<PracticeItem | null>(null);
  const [shownAnswers, setShownAnswers] = useState<Set<string>>(new Set());

  // User input
  const [userAnswer, setUserAnswer] = useState<string>("");

  // Feedback
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [feedbackUserAnswer, setFeedbackUserAnswer] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [hintVisible, setHintVisible] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [unairedStreak, setUnairedStreak] = useState(0);
  const [isFirstAttempt, setIsFirstAttempt] = useState(true);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [firstTrySuccesses, setFirstTrySuccesses] = useState(0);
  const firstTryHistoryRef = useRef<{ correct: boolean; key: string; aided: boolean }[]>([]);
  const [firstTryWrong, setFirstTryWrong] = useState(0);
  const initialFetchStartedRef = useRef(false);
  const episodeCompletionInFlightRef = useRef(false);
  const shownQuestionKeysRef = useRef<Set<string>>(new Set());

  // Track wrong attempts per sub-skill for adaptive teaching
  const [wrongCountPerSubSkill, setWrongCountPerSubSkill] = useState<Record<string, number>>({});

  // Loading state
  const [loading, setLoading] = useState(false);
  const [teachLoading, setTeachLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Parse episode data from route params
    if (params.data && typeof params.data === "string") {
      try {
        const data = JSON.parse(params.data);
        setEpisodeData(data);
        // Initialize practice queue exactly once. A second initial fetch was
        // overwriting the item already on screen (question-changes-on-tap bug).
        if (!initialFetchStartedRef.current) {
          initialFetchStartedRef.current = true;
          fetchPracticeItems(data);
        }
      } catch (err) {
        console.error("[episode] failed to parse data:", err);
        setError("Failed to load episode data");
      }
    }

    // Parse episodeId from route params
    if (params.episodeId && typeof params.episodeId === "string") {
      setEpisodeId(params.episodeId);
    }
  }, [params.data, params.episodeId]);

  // Initialize episode logging on mount
  useEffect(() => {
    const initializeEpisodeLogging = async () => {
      if (!episodeId) return;

      try {
        // Get parentId from auth
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          setParentId(user.id);
        }

        // Fetch child_id from tutor_episodes
        const { data: epRow } = await supabase
          .from('tutor_episodes')
          .select('child_id, status')
          .eq('id', episodeId)
          .single();

        if (epRow?.child_id) {
          setChildId(epRow.child_id);
        }

        // Update status from 'pending' to 'in_progress' if needed
        if (epRow?.status === 'pending') {
          try {
            await supabase
              .from('tutor_episodes')
              .update({ status: 'in_progress' })
              .eq('id', episodeId);
            console.log('[episode status updated]', { episodeId, status: 'in_progress' });
          } catch (err) {
            console.error('[episode status update error]', err);
            // Non-blocking - continue even if status update fails
          }
        }

        console.log('[episode initialized]', { episodeId, parentId: user?.id, childId: epRow?.child_id, status: epRow?.status });
      } catch (err) {
        console.error('[episode init error]', err);
        // Non-blocking - continue without logging if init fails
      }
    };

    initializeEpisodeLogging();
  }, [episodeId]);

  // Resume: rebuild first-try history from saved attempts
  useEffect(() => {
    if (!episodeId) return;
    const rebuildFromAttempts = async () => {
      try {
        const { data: prior } = await supabase
          .from("episode_attempts")
          .select("question, was_correct, aided, created_at")
          .eq("episode_id", episodeId)
          .order("created_at", { ascending: true });
        if (!prior || prior.length === 0) return;
        const seen = new Set<string>();
        const rebuilt: { correct: boolean; key: string; aided: boolean }[] = [];
        for (const a of prior) {
          const key = a.question as string;
          if (seen.has(key)) continue;
          seen.add(key);
          rebuilt.push({ correct: !!a.was_correct, key, aided: !!a.aided });
        }
        firstTryHistoryRef.current = rebuilt;
        setFirstTrySuccesses(rebuilt.filter((h) => h.correct && !h.aided).length);
        setFirstTryWrong(rebuilt.filter((h) => !h.correct).length);
      } catch (err) {
        console.error("[episode] resume rebuild error:", err);
      }
    };
    rebuildFromAttempts();
  }, [episodeId]);

  // Track max streak
  useEffect(() => {
    if (unairedStreak > unaidedStreakMax) {
      setUnaidedStreakMax(unairedStreak);
    }
  }, [unairedStreak, unaidedStreakMax]);

  useEffect(() => {
    // Log when item is shown
    if (currentItem && phase === "practice") {
      console.log(
        "[item]",
        JSON.stringify({
          q: currentItem.question,
          expected: currentItem.expected_answer || currentItem.answer,
          sub_skill: currentItem.sub_skill,
          kind: currentItem.kind,
          answer_type: currentItem.answer_type,
        })
      );
    }
  }, [currentItem, phase]);

  const isPluriel = (c: any) =>
    JSON.stringify(c ?? "").toLowerCase().includes("pluriel");

  const fetchPracticeItems = async (data: EpisodeData) => {
    try {
      setLoading(true);

      // Bankable concept -> deterministic bank, no AI, no refetch (can't stall).
      if (isPluriel(data.concept)) {
        const drawn = drawPlurals(SKILL_SESSION.sessionCap, Array.from(shownAnswers));
        const bankItems = drawn.map((e) => ({
          kind: "reference",
          sub_skill: e.subSkill,
          question: `Mets ce mot au pluriel : « ${e.singular} »`,
          expected_answer: e.plural,
          answer: e.plural,
        })) as unknown as PracticeItem[];
        bankItems.forEach((it) =>
          setShownAnswers((prev) => new Set([...prev, String((it as any).expected_answer)]))
        );
        if (currentItem === null && bankItems.length > 0) {
          setCurrentItem(bankItems[0]);
          setPracticeQueue(bankItems.slice(1));
        } else if (bankItems.length > 0) {
          setPracticeQueue((prev) => [...prev, ...bankItems]);
        }
        setLoading(false);
        return;
      }

      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "generate-practice",
        {
          body: {
            concept: data.concept,
            grade_band: data.grade_band,
            language: data.language,
            domain: data.domain,
            count: SKILL_SESSION.sessionCap,
            avoid: Array.from(shownAnswers),
            sessionSeed: episodeId || params.episodeId || "",
          },
        }
      );

      if (invokeError) {
        throw invokeError;
      }

      const rawItems = (result.practice || []) as PracticeItem[];
      const items = rawItems.filter((item) => {
        const key = normalizeQuestionKey(item.question);
        if (shownQuestionKeysRef.current.has(key)) return false;
        shownQuestionKeysRef.current.add(key);
        return true;
      });

      // No-stall guard: AI returned nothing on a refetch -> end gracefully, never freeze.
      if (items.length === 0 && currentItem !== null) {
        const supplyMastered = isMasteredFromHistory(firstTryHistoryRef.current);
        const { correct, total, hinted } = getCompletionStats();
        await completeEpisode(supplyMastered);
        Alert.alert(
          supplyMastered ? "Bravo ! 🎉" : "À bientôt !",
          supplyMastered
            ? `Tu as réussi ${correct} sur ${total}${formatHintSummary(hinted)} ! Tu maîtrises bien ça ! 🎉`
            : `Beau travail ! Tu as réussi ${correct} sur ${total}${formatHintSummary(hinted)}. Tu peux être fier de tes efforts aujourd'hui.`
        );
        navigateAfterEpisodeComplete();
        setLoading(false);
        return;
      }

      // Log returned practice items
      console.log(
        "[generate-practice] received items:",
        items.map((item) => ({
          question: item.question,
          expected_answer: (item as any).expected_answer || item.answer,
          sub_skill: item.sub_skill,
          kind: item.kind,
        }))
      );
      // Add expected answers to shown set
      items.forEach((item) => {
        const answer = String((item as any).expected_answer || item.answer);
        setShownAnswers((prev) => new Set([...prev, answer]));
      });

      // CRITICAL: If currentItem is null (first fetch), set it and append rest to queue.
      // If currentItem exists (background refetch), ONLY append to queue tail — never touch currentItem.
      if (currentItem === null && items.length > 0) {
        setCurrentItem(items[0]);
        setPracticeQueue(items.slice(1));
      } else if (items.length > 0) {
        // Background refetch: append new items to tail of existing queue
        setPracticeQueue((prevQueue) => [...prevQueue, ...items]);
      }
      setLoading(false);
    } catch (err) {
      console.error("[episode] failed to fetch practice items:", err);
      setError(`Failed to load practice items: ${String(err)}`);
      setLoading(false);
      // Allow a retry if the very first load failed
      initialFetchStartedRef.current = false;
    }
  };

  const normalizeAnswer = (text: string): string => {
    let normalized = text
      .normalize("NFC")
      .toLowerCase()
      .replace(/'/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Strip leading articles
    normalized = normalized.replace(/^(le|la|les|l'|un|une|des|the|a|an)\s+/i, "");

    // Strip trailing punctuation
    normalized = normalized.replace(/[.,!?;:]+$/, "");

    return normalized;
  };

  const normalizeQuestionKey = (text: string): string =>
    text
      .normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const normalizeNumberInput = (text: string): number => {
    // Remove € symbol and spaces
    let cleaned = text.replace(/€/g, "").replace(/\s/g, "");
    // Replace comma with period (French decimal)
    cleaned = cleaned.replace(",", ".");
    return parseFloat(cleaned);
  };

  const gradeAnswer = (): boolean => {
    if (!currentItem) return false;

    let correct = false;

    if (currentItem.kind === "math") {
      if (currentItem.answer_type === "number") {
        try {
          const userNum = normalizeNumberInput(userAnswer);
          const expectedNum = parseFloat(String(currentItem.answer));
          correct = Math.abs(userNum - expectedNum) < 0.005;
        } catch {
          correct = false;
        }
      } else if (currentItem.answer_type === "yesno") {
        const userBool = userAnswer === "Oui";
        const expectedBool =
          currentItem.answer === true ||
          String(currentItem.answer).toLowerCase() === "oui";
        correct = userBool === expectedBool;
      }
    } else if (currentItem.kind === "reference") {
      const userNorm = normalizeAnswer(userAnswer);
      const expectedAnswer = (currentItem as any).expected_answer || currentItem.answer;
      const expectedNorm = normalizeAnswer(String(expectedAnswer));
      correct = userNorm === expectedNorm;
    }

    // Grade-time proof log: shown and expected MUST be from same currentItem
    console.log(
      "[grade]",
      JSON.stringify({
        shown: currentItem.question,
        expected: (currentItem as any).expected_answer || currentItem.answer,
        typed: userAnswer,
        correct,
      })
    );

    return correct;
  };

  const formatAnswerDisplay = (item: PracticeItem): string => {
    // Use expected_answer if available (for language items), otherwise use answer
    const answerValue = (item as any).expected_answer || item.answer;

    if (item.kind === "math") {
      if (item.answer_type === "number") {
        const num = typeof answerValue === "number" ? answerValue : parseFloat(String(answerValue));
        if (item.unit === "€") {
          // Format as French money: two decimals with comma
          return num.toFixed(2).replace(".", ",") + " €";
        } else {
          // Format as plain integer count
          return Math.round(num).toString();
        }
      }
    }
    return String(answerValue);
  };

  const logAttempt = async (
    item: PracticeItem,
    childAnswer: string,
    wasCorrect: boolean,
    aided = false
  ) => {
    if (!episodeId || !parentId || !childId) return;

    try {
      await supabase.from('episode_attempts').insert({
        episode_id: episodeId,
        parent_id: parentId,
        child_id: childId,
        sub_skill: item.sub_skill ?? null,
        question: item.question,
        expected_answer: String((item as any).expected_answer ?? item.answer ?? ''),
        child_answer: String(childAnswer),
        was_correct: wasCorrect,
        aided,
        attempt_index: 0,
      });
    } catch (err) {
      console.error('[attempt log error]', err);
      // Non-blocking
    }
  };

  const maxCorrectRun = () => {
    let best = 0;
    let current = 0;
    for (const entry of firstTryHistoryRef.current) {
      current = entry.correct && !entry.aided ? current + 1 : 0;
      best = Math.max(best, current);
    }
    return best;
  };

  const isMasteredFromHistory = (history: { correct: boolean; key: string; aided: boolean }[]) => {
    const recent = history.slice(-SKILL_SESSION.masteryWindow);
    if (recent.length < SKILL_SESSION.masteryWindow) return false;

    const hintUsedInWindow = recent.some((h) => h.aided);
    const correctInWindow = recent.filter((h) => h.correct).length;
    const distinctInWindow = new Set(recent.map((h) => h.key)).size;

    return (
      !hintUsedInWindow &&
      correctInWindow >= SKILL_SESSION.masteryFirstTryCorrect &&
      distinctInWindow >= SKILL_SESSION.masteryMinDistinctItems
    );
  };

  const getCompletionStats = () => {
    const history = firstTryHistoryRef.current;
    const correct = history.filter((h) => h.correct).length;
    const hinted = history.filter((h) => h.aided).length;
    const unaidedCorrect = history.filter((h) => h.correct && !h.aided).length;

    return {
      total: history.length,
      correct,
      hinted,
      unaidedCorrect,
    };
  };

  const formatHintSummary = (hinted: number) => {
    if (hinted === 0) return " (sans indice)";
    return ` (${hinted} avec ${hinted === 1 ? "un indice" : "des indices"})`;
  };

  const getEpisodeStarsDelta = () => {
    const { total, unaidedCorrect } = getCompletionStats();
    const allCorrectWithoutHelp = total > 0 && unaidedCorrect === total;
    return unaidedCorrect * 2 + (allCorrectWithoutHelp ? 5 : 0);
  };

  const navigateAfterEpisodeComplete = () => {
    if (childId) {
      router.replace({
        pathname: "/child-home/[childId]",
        params: { childId },
      });
      return;
    }
    router.back();
  };

  const callTeach = async (item: PracticeItem, childAnswer: string, attemptNum: number) => {
    try {
      setTeachLoading(true);
      const { data, error: invokeError } = await supabase.functions.invoke("teach", {
        body: {
          item: {
            question: item.question,
            correct_answer: formatAnswerDisplay(item),
            sub_skill: item.sub_skill,
            answer_type: item.answer_type,
            domain: episodeData?.domain || "math",
            check_expression: item.kind === "math" ? "N/A" : undefined,
            expected_answer: item.kind === "reference" ? item.answer : undefined,
          },
          child_answer: childAnswer,
          concept: episodeData?.concept || { label: "", description: "", sub_skills: [] },
          language: episodeData?.language || "French",
          grade_band: episodeData?.grade_band || "CE1",
          attempt: attemptNum,
        },
      });

      if (invokeError) {
        console.error("[episode] teach error:", invokeError);
        setExplanation("Essaye encore! Tu es sur la bonne voie. 💪");
      } else {
        setExplanation(data?.explanation || "Essaye encore!");
      }
      setTeachLoading(false);
    } catch (err) {
      console.error("[episode] teach call error:", err);
      setExplanation("Essaye encore! Tu es sur la bonne voie. 💪");
      setTeachLoading(false);
    }
  };

  const getItemHint = (item: PracticeItem) =>
    item.hint || {
      title: "Aide",
      steps: [
        "Relis la question et entoure ce qu'il faut chercher.",
        "Utilise la même méthode que sur la fiche avant de répondre.",
      ],
    };

  const handleShowHint = () => {
    setHintVisible(true);
    setHintLevel((level) => Math.min(level + 1, 2));
  };

  const handleSubmitAnswer = () => {
    if (!userAnswer.trim()) {
      Alert.alert("Erreur", "Veuillez entrer une réponse");
      return;
    }

    const correct = gradeAnswer();
    setIsCorrect(correct);
    setExplanation("");
    setFeedbackUserAnswer(userAnswer.trim());
    setTotalAttempts(totalAttempts + 1);

    // Log first-try attempt (if episodeId present)
    if (isFirstAttempt && currentItem) {
      logAttempt(currentItem, userAnswer, correct, hintVisible);
      firstTryHistoryRef.current.push({ correct, key: currentItem.question, aided: hintVisible });
    }

    if (correct && isFirstAttempt) {
      // Correct on first try without help counts toward unaided mastery.
      setFeedbackMessage(hintVisible ? "Bien joué avec l'aide !" : "Bravo ! 🎉");
      if (hintVisible) {
        setUnairedStreak(0);
      } else {
        setUnairedStreak(unairedStreak + 1);
        setFirstTrySuccesses(firstTrySuccesses + 1);
      }
      // Auto advance after delay
      setTimeout(() => {
        void advanceToNextItem();
      }, 1500);
      setPhase("feedback");
    } else if (correct && !isFirstAttempt) {
      // Correct but not on first try — no streak increment, just advance
      setFeedbackMessage("Correct ! ✓");
      // Auto advance after delay
      setTimeout(() => {
        void advanceToNextItem();
      }, 1500);
      setPhase("feedback");
    } else {
      // Wrong answer on first attempt
      if (isFirstAttempt) {
        // Track wrong attempt for this sub-skill
        const subSkill = currentItem?.sub_skill || "unknown";
        const currentWrongCount = (wrongCountPerSubSkill[subSkill] || 0) + 1;
        setWrongCountPerSubSkill({
          ...wrongCountPerSubSkill,
          [subSkill]: currentWrongCount,
        });

        const attemptNum = Math.min(currentWrongCount, 3);
        const displayAnswer = formatAnswerDisplay(currentItem!);
        setFeedbackMessage(`La réponse attendue : ${displayAnswer}`);

        // Reset unaided streak on first wrong attempt
        setUnairedStreak(0);
        setFirstTryWrong((w) => w + 1);
        setIsFirstAttempt(false);

        // Call teach for adaptive explanation
        if (currentItem) {
          callTeach(currentItem, userAnswer, attemptNum);
        }
      }

      setPhase("feedback");
    }
  };

  const handleYesNoChoice = (choice: "Oui" | "Non") => {
    setUserAnswer(choice);
    setExplanation("");
    setFeedbackUserAnswer(choice);
    setTotalAttempts(totalAttempts + 1);

    // Map choice to boolean and compare to item's boolean answer
    const userBool = choice === "Oui";
    const expectedBool =
      currentItem?.answer === true ||
      String(currentItem?.answer).toLowerCase() === "oui";
    const correct = userBool === expectedBool;

    // Grade-time proof log: shown and expected MUST be from same currentItem
    if (currentItem) {
      console.log(
        "[grade]",
        JSON.stringify({
          shown: currentItem.question,
          expected: (currentItem as any).expected_answer || currentItem.answer,
          typed: choice,
          correct,
        })
      );
    }

    setIsCorrect(correct);

    // Log first-try attempt (if episodeId present)
    if (isFirstAttempt && currentItem) {
      logAttempt(currentItem, choice, correct, hintVisible);
      firstTryHistoryRef.current.push({ correct, key: currentItem.question, aided: hintVisible });
    }

    if (correct && isFirstAttempt) {
      // Correct on first try without help counts toward unaided mastery.
      setFeedbackMessage(hintVisible ? "Bien joué avec l'aide !" : "Bravo ! 🎉");
      if (hintVisible) {
        setUnairedStreak(0);
      } else {
        setUnairedStreak(unairedStreak + 1);
        setFirstTrySuccesses(firstTrySuccesses + 1);
      }
      // Auto advance after delay
      setTimeout(() => {
        void advanceToNextItem();
      }, 1500);
      setPhase("feedback");
    } else if (correct && !isFirstAttempt) {
      // Correct but not on first try — no streak increment, just advance
      setFeedbackMessage("Correct ! ✓");
      // Auto advance after delay
      setTimeout(() => {
        void advanceToNextItem();
      }, 1500);
      setPhase("feedback");
    } else {
      // Wrong answer on first attempt
      if (isFirstAttempt) {
        // Track wrong attempt for this sub-skill
        const subSkill = currentItem?.sub_skill || "unknown";
        const currentWrongCount = (wrongCountPerSubSkill[subSkill] || 0) + 1;
        setWrongCountPerSubSkill({
          ...wrongCountPerSubSkill,
          [subSkill]: currentWrongCount,
        });

        const attemptNum = Math.min(currentWrongCount, 3);
        const expectedChoice = expectedBool ? "Oui" : "Non";
        setFeedbackMessage(`La réponse attendue : ${expectedChoice}`);

        // Reset unaided streak on first wrong attempt
        setUnairedStreak(0);
        setFirstTryWrong((w) => w + 1);
        setIsFirstAttempt(false);

        // Call teach for adaptive explanation
        if (currentItem) {
          callTeach(currentItem, choice, attemptNum);
        }
      }

      setPhase("feedback");
    }
  };

  const completeEpisode = async (mastered: boolean) => {
    if (!episodeId || episodeCompletionInFlightRef.current) return;

    episodeCompletionInFlightRef.current = true;
    try {
      const { data: existingEpisode, error: readError } = await supabase
        .from('tutor_episodes')
        .select('status, completed_at, child_id')
        .eq('id', episodeId)
        .maybeSingle();

      if (readError) {
        throw readError;
      }

      const alreadyComplete =
        existingEpisode?.status === 'complete' || !!existingEpisode?.completed_at;
      const awardChildId = childId || existingEpisode?.child_id;
      const { unaidedCorrect } = getCompletionStats();
      const starsDelta = getEpisodeStarsDelta();

      const { error: updateError } = await supabase.from('tutor_episodes').update({
          status: 'complete',
          completed_at: new Date().toISOString(),
          mastered,
          items_attempted: firstTryHistoryRef.current.length,
          first_try_correct: unaidedCorrect,
          unaided_streak_max: Math.max(unaidedStreakMax, maxCorrectRun()),
        }).eq('id', episodeId);

      if (updateError) {
        throw updateError;
      }

      if (!alreadyComplete && awardChildId && starsDelta > 0) {
        console.log('[episode] awarding stars:', { childId: awardChildId, starsDelta, unaidedCorrect });
        await addStars(awardChildId, starsDelta);
      }

      console.log('[episode complete]', {
        episodeId,
        mastered,
        items_attempted: firstTryHistoryRef.current.length,
        first_try_correct: unaidedCorrect,
        unaided_streak_max: Math.max(unaidedStreakMax, maxCorrectRun()),
        stars_awarded: alreadyComplete ? 0 : starsDelta,
      });
    } catch (err) {
      console.error('[episode complete error]', err);
      // Non-blocking
    } finally {
      episodeCompletionInFlightRef.current = false;
    }
  };

  const advanceToNextItem = async () => {
    // Check if we've reached mastery or item cap
    const history = firstTryHistoryRef.current;
    const mastered = isMasteredFromHistory(history);

    if (mastered) {
      // MASTERY REACHED
      await completeEpisode(true);
      const { correct, total, hinted } = getCompletionStats();
      Alert.alert(
        "Bravo ! 🎉",
        `Tu as réussi ${correct} sur ${total}${formatHintSummary(hinted)} ! Tu maîtrises bien ça ! 🎉`
      );
      navigateAfterEpisodeComplete();
      return;
    }

    if (history.length >= SKILL_SESSION.sessionCap) {
      // Item cap reached without mastery - honest, kind, non-celebratory
      await completeEpisode(false);
      const { correct, total, hinted } = getCompletionStats();
      const message = `Beau travail ! Tu as réussi ${correct} sur ${total}${formatHintSummary(hinted)}. Tu peux être fier de tes efforts aujourd'hui.`;
      Alert.alert("À bientôt !", message);
      navigateAfterEpisodeComplete();
      return;
    }

    // Pop the next item from the queue head
    if (practiceQueue.length > 0) {
      const nextItem = practiceQueue[0];
      const remainingQueue = practiceQueue.slice(1);
      setPracticeQueue(remainingQueue);
      setCurrentItem(nextItem);
      setUserAnswer("");
      setPhase("practice");
      setIsCorrect(null);
      setFeedbackMessage("");
      setFeedbackUserAnswer("");
      setExplanation("");
      setHintVisible(false);
      setHintLevel(0);
      setIsFirstAttempt(true);
    } else if (episodeData) {
      // Queue is empty, trigger a fetch and wait for currentItem to be set
      console.log("[advanceToNextItem] queue empty, fetching...");
      fetchPracticeItems(episodeData);
    }
  };

  const handleBack = () => {
    if (phase === "feedback" && !isCorrect) {
      // Allow going back when wrong answer is shown
      setPhase("practice");
      setIsCorrect(null);
      setFeedbackMessage("");
      setFeedbackUserAnswer("");
      return;
    }
    router.back();
  };

  if (!episodeData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Épisode</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196f3" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{episodeData.concept.label}</Text>
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>✓ {firstTrySuccesses}   ✗ {firstTryWrong}</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
          {/* LESSON PHASE */}
          {phase === "lesson" && (
            <View style={styles.card}>
              <View style={styles.lessonSection}>
                <Text style={styles.lessonTitle}>{episodeData.concept.label}</Text>
                <Text style={styles.lessonDescription}>{episodeData.concept.description}</Text>
              </View>

              <View style={styles.lessonBody}>
                <Text style={styles.lessonText}>{episodeData.lesson}</Text>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setPhase("practice");
                  // Only kick off the initial fetch if it hasn't already started
                  // (a duplicate fetch was swapping the question out from under you)
                  if (!initialFetchStartedRef.current && practiceQueue.length === 0) {
                    initialFetchStartedRef.current = true;
                    fetchPracticeItems(episodeData);
                  }
                }}
              >
                <Text style={styles.primaryButtonText}>Commencer</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* PRACTICE PHASE */}
          {phase === "practice" && currentItem && (
            <View style={styles.card}>
              <View style={styles.itemHeader}>
                <View style={styles.subSkillTag}>
                  <Text style={styles.subSkillTagText}>{currentItem.sub_skill}</Text>
                </View>
                <Text style={styles.itemNumber}>
                  {Math.max(0, practiceQueue.length - 1)} left
                </Text>
              </View>

              <Text style={styles.question}>{currentItem.question}</Text>
              <Text style={{ textAlign: "center", color: "#888", fontSize: 13, marginTop: 6 }}>
                Réussis 10 sur 12 du premier coup pour maîtriser cette compétence
              </Text>

              <TouchableOpacity
                style={styles.hintButton}
                onPress={handleShowHint}
                disabled={loading}
              >
                <MaterialCommunityIcons name="lightbulb-outline" size={18} color="#795548" />
                <Text style={styles.hintButtonText}>
                  {hintVisible ? "Encore un indice" : "Aide"}
                </Text>
              </TouchableOpacity>

              {hintVisible && (
                <View style={styles.hintBox}>
                  <Text style={styles.hintTitle}>{getItemHint(currentItem).title}</Text>
                  {getItemHint(currentItem).visual_rows?.map((row, index) => (
                    <View style={styles.cduVisualRow} key={`${row.label || "row"}-${index}`}>
                      <Text style={styles.cduVisualLabel}>{row.label || index + 1}</Text>
                      <View style={styles.cduCell}>
                        <Text style={styles.cduCellLabel}>c</Text>
                        <Text style={styles.cduCellValue}>{row.c}</Text>
                      </View>
                      <View style={styles.cduCell}>
                        <Text style={styles.cduCellLabel}>d</Text>
                        <Text style={styles.cduCellValue}>{row.d}</Text>
                      </View>
                      <View style={styles.cduCell}>
                        <Text style={styles.cduCellLabel}>u</Text>
                        <Text style={styles.cduCellValue}>{row.u}</Text>
                      </View>
                      {typeof row.value === "number" && (
                        <Text style={styles.cduValueText}>{row.value}</Text>
                      )}
                    </View>
                  ))}
                  {getItemHint(currentItem).steps?.slice(0, hintLevel === 1 ? 1 : undefined).map((step, index) => (
                    <Text style={styles.hintStep} key={`${step}-${index}`}>
                      {index + 1}. {step}
                    </Text>
                  ))}
                </View>
              )}

              {/* Math Number Input */}
              {currentItem.kind === "math" && currentItem.answer_type === "number" && (
                <View style={styles.inputSection}>
                  <View style={styles.numberInputContainer}>
                    <TextInput
                      style={styles.numberInput}
                      placeholder="Entrez un nombre"
                      placeholderTextColor="#999"
                      keyboardType="decimal-pad"
                      value={userAnswer}
                      onChangeText={setUserAnswer}
                      editable={!loading}
                    />
                    {currentItem.unit === "€" && (
                      <View style={styles.unitSuffix}>
                        <Text style={styles.unitText}>€</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                    onPress={handleSubmitAnswer}
                    disabled={loading}
                  >
                    <Text style={styles.submitButtonText}>Valider</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Math Yes/No Buttons */}
              {currentItem.kind === "math" && currentItem.answer_type === "yesno" && (
                <View style={styles.yesNoContainer}>
                  <TouchableOpacity
                    style={[styles.yesNoButton, styles.yesButton]}
                    onPress={() => handleYesNoChoice("Oui")}
                    disabled={loading}
                  >
                    <Text style={styles.yesNoButtonText}>Oui</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yesNoButton, styles.noButton]}
                    onPress={() => handleYesNoChoice("Non")}
                    disabled={loading}
                  >
                    <Text style={styles.yesNoButtonText}>Non</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Language Text Input */}
              {currentItem.kind === "reference" && (
                <View style={styles.inputSection}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Entrez votre réponse"
                    placeholderTextColor="#999"
                    value={userAnswer}
                    onChangeText={setUserAnswer}
                    editable={!loading}
                    autoCorrect={false}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    textContentType="none"
                    importantForAutofill="no"
                    keyboardType="default"
                  />
                  <TouchableOpacity
                    style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                    onPress={handleSubmitAnswer}
                    disabled={loading}
                  >
                    <Text style={styles.submitButtonText}>Valider</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* FEEDBACK PHASE */}
          {phase === "feedback" && (
            <View style={styles.card}>
              <View
                style={[
                  styles.feedbackBox,
                  isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
                ]}
              >
                <View style={styles.feedbackIconRow}>
                  <MaterialCommunityIcons
                    name={isCorrect ? "check-circle" : "close-circle"}
                    size={48}
                    color={isCorrect ? "#4caf50" : "#f44336"}
                  />
                  <Text style={styles.feedbackText}>{feedbackMessage}</Text>
                  {!isCorrect && feedbackUserAnswer ? (
                    <View style={styles.childAnswerBox}>
                      <Text style={styles.childAnswerLabel}>Ta réponse</Text>
                      <Text style={styles.childAnswerText}>{feedbackUserAnswer}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {!isCorrect && teachLoading && (
                <View style={styles.teachingBox}>
                  <ActivityIndicator size="small" color="#2196f3" />
                  <Text style={styles.teachingText}>Skeelio réfléchit…</Text>
                </View>
              )}

              {!isCorrect && !teachLoading && explanation && (
                <View style={styles.explanationBox}>
                  <Text style={styles.explanationText}>{explanation}</Text>
                </View>
              )}

              {!isCorrect && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    void advanceToNextItem();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Continuer</Text>
                </TouchableOpacity>
              )}

              {isCorrect && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => void advanceToNextItem()}
                >
                  <Text style={styles.primaryButtonText}>Suivant</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loading && phase === "practice" && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196f3" />
              <Text style={styles.loadingText}>Chargement des exercices...</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 12,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fff3e0",
    borderRadius: 12,
  },
  streakText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ff6b00",
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lessonSection: {
    marginBottom: 20,
  },
  lessonTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  lessonDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  lessonBody: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: "#2196f3",
  },
  lessonText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#4caf50",
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  subSkillTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#e3f2fd",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#90caf9",
  },
  subSkillTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1976d2",
  },
  itemNumber: {
    fontSize: 12,
    color: "#999",
    fontWeight: "500",
  },
  question: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    lineHeight: 22,
    marginBottom: 20,
  },
  hintButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffe0b2",
    marginTop: 14,
    marginBottom: 12,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#795548",
  },
  hintBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fffdf5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffe0b2",
    marginBottom: 16,
    gap: 8,
  },
  hintTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5d4037",
  },
  cduVisualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cduVisualLabel: {
    minWidth: 28,
    fontSize: 13,
    fontWeight: "700",
    color: "#5d4037",
  },
  cduCell: {
    width: 42,
    borderWidth: 1,
    borderColor: "#d7ccc8",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  cduCellLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "#795548",
    backgroundColor: "#efebe9",
    paddingVertical: 2,
  },
  cduCellValue: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    paddingVertical: 5,
  },
  cduValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5d4037",
  },
  hintStep: {
    fontSize: 14,
    color: "#4e342e",
    lineHeight: 20,
  },
  inputSection: {
    gap: 12,
  },
  numberInputContainer: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  unitSuffix: {
    position: "absolute",
    right: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  unitText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  submitButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  yesNoContainer: {
    flexDirection: "row",
    gap: 12,
  },
  yesNoButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  yesButton: {
    backgroundColor: "#4caf50",
  },
  noButton: {
    backgroundColor: "#f44336",
  },
  yesNoButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  feedbackBox: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: "center",
  },
  feedbackCorrect: {
    backgroundColor: "#e8f5e9",
    borderWidth: 2,
    borderColor: "#4caf50",
  },
  feedbackWrong: {
    backgroundColor: "#ffebee",
    borderWidth: 2,
    borderColor: "#f44336",
  },
  feedbackIconRow: {
    alignItems: "center",
    gap: 12,
  },
  feedbackText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginTop: 12,
    textAlign: "center",
  },
  childAnswerBox: {
    alignSelf: "stretch",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffcdd2",
  },
  childAnswerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c62828",
    marginBottom: 4,
  },
  childAnswerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
    marginTop: 12,
  },
  errorBanner: {
    backgroundColor: "#ffebee",
    borderBottomWidth: 1,
    borderBottomColor: "#ffcdd2",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#d32f2f",
  },
  teachingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    marginBottom: 16,
  },
  teachingText: {
    fontSize: 13,
    color: "#1976d2",
    fontWeight: "500",
  },
  explanationBox: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#2196f3",
    marginBottom: 16,
  },
  explanationText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
});
