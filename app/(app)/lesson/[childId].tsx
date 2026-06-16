import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LADDERS, TEACH_NOTES, Operation, FACT_TIERS } from "@/lib/tutorConfig";
import {
  pickAdditionStrategy,
  pickSubtractionStrategy,
  pickMultiplicationStrategy,
  pickDivisionStrategy,
} from "@/lib/tutor/strategies";
import { pickTeachExample } from "@/lib/tutor/generate";
import { computeExampleSteps } from "@/lib/tutor/steps";
import { StrategyView } from "@/lib/tutor/visuals";
import QuitButton from "@/components/QuitButton";
import { supabase } from "@/lib/supabase";
import { appLanguageForChild, AppLanguage } from "@/lib/appLanguage";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentScroll: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 24,
  },
  exampleBox: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  exampleText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  stepText: {
    fontSize: 14,
    color: "#1a1a1a",
    lineHeight: 20,
    marginBottom: 8,
  },
  inputBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 6,
    fontSize: 16,
    marginBottom: 12,
    marginTop: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#2196f3",
    borderRadius: 6,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "#f0f0f0",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonTextSecondary: {
    color: "#1a1a1a",
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4caf50",
    marginTop: 16,
    textAlign: "center",
  },
  navButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 24,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#2196f3",
    borderRadius: 6,
    alignItems: "center",
  },
  navButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  yourTurnContent: {
    flex: 1,
  },
  hintContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
});

interface TierInfo {
  id: string;
  label: string;
  operation: Operation;
}

const COPY = {
  en: {
    loading: "Loading...",
    learn: "Let's learn:",
    how: "How it works",
    yourTurn: "Your turn",
    placeholder: "Enter your answer",
    nice: "Nice! ✓",
    hide: "Hide",
    showMe: "Show me how",
    check: "Check",
    ready: "Ready?",
    readyPractice: (tier: string) => `Ready to practice ${tier}?`,
    letsGo: "Let's go",
    skip: "Skip",
    gotIt: "Got it",
    next: "Next",
    start: "Start practice",
  },
  fr: {
    loading: "Chargement...",
    learn: "On apprend :",
    how: "Comment ça marche",
    yourTurn: "À toi",
    placeholder: "Écris ta réponse",
    nice: "Bravo ! ✓",
    hide: "Masquer",
    showMe: "Montre-moi",
    check: "Valider",
    ready: "Prêt ?",
    readyPractice: (tier: string) => `Prêt à t'entraîner : ${tier} ?`,
    letsGo: "C'est parti",
    skip: "Passer",
    gotIt: "J'ai compris",
    next: "Suivant",
    start: "Commencer",
  },
} as const;

export default function LessonScreen() {
  const router = useRouter();
  const { childId, tierId, tierLabel, operation } = useLocalSearchParams<{
    childId: string;
    tierId: string;
    tierLabel: string;
    operation: Operation;
  }>();

  const [page, setPage] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    if (!childId) return;
    supabase
      .from("children")
      .select("languages, preferred_language")
      .eq("id", childId)
      .single()
      .then(({ data }) => setAppLanguage(appLanguageForChild(data)));
  }, [childId]);

  // Keep your-turn example stable across re-renders (only compute once per tier)
  const yourTurnQRef = useRef<any>(null);
  if (!yourTurnQRef.current) {
    yourTurnQRef.current = pickTeachExample(operation as Operation, tierId);
  }

  if (!childId || !tierId || !tierLabel || !operation) {
    const copy = COPY[appLanguage];
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.contentScroll}>
          <Text>{copy.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Get strategy picker based on operation
  const getStrategyPicker = () => {
    if (operation === "addition") return pickAdditionStrategy;
    if (operation === "subtraction") return pickSubtractionStrategy;
    if (operation === "multiplication") return pickMultiplicationStrategy;
    if (operation === "division") return pickDivisionStrategy;
    return null;
  };

  // Generate worked example (for page 1 only)
  const exampleQ = pickTeachExample(operation as Operation, tierId);
  const yourTurnQ = yourTurnQRef.current;

  const opSymbol =
    operation === "addition"
      ? "+"
      : operation === "subtraction"
      ? "−"
      : operation === "multiplication"
      ? "×"
      : "÷";

  const teachNotes = TEACH_NOTES[tierId] || "";
  const isFactTier = FACT_TIERS.has(tierId);
  const copy = COPY[appLanguage];

  const handleCheck = () => {
    const correct = String(yourTurnQ.answer) === userAnswer.trim();
    setIsCorrect(correct);
    if (correct) {
      setShowAnswer(false);
    } else {
      setShowAnswer(true);
    }
  };

  const handleNext = () => {
    if (page < 3) {
      setPage(page + 1);
      setUserAnswer("");
      setShowAnswer(false);
      setIsCorrect(false);
    } else {
      // Navigate to practice after lesson complete (lessonShown prevents re-routing to lesson)
      router.push({
        pathname: "/practice",
        params: { topic: operation, childId, lessonShown: "true" },
      });
    }
  };

  const handleSkip = () => {
    router.push({
      pathname: "/practice",
      params: { topic: operation, childId, lessonShown: "true" },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <QuitButton />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.contentScroll} keyboardShouldPersistTaps="handled">
        {page === 0 && (
          <>
            <Text style={styles.header}>
              {copy.learn}
              {" "}
              {tierLabel}
            </Text>
            <Text style={styles.subtitle}>{teachNotes}</Text>
          </>
        )}

        {page === 1 && (
          <>
            <Text style={styles.header}>{copy.how}</Text>
            <View style={styles.exampleBox}>
              <Text style={styles.exampleText}>
                {exampleQ.a} {opSymbol} {exampleQ.b} = ?
              </Text>
            </View>

            {isFactTier ? (
              (() => {
                const picker = getStrategyPicker();
                if (!picker) return null;
                const plan =
                  operation === "addition"
                    ? picker(exampleQ.a, exampleQ.b)
                    : operation === "subtraction"
                    ? picker(exampleQ.a, exampleQ.b)
                    : operation === "multiplication"
                    ? picker(exampleQ.a, exampleQ.b)
                    : picker(exampleQ.a, exampleQ.b);
                return <StrategyView plan={plan} showStep2={true} />;
              })()
            ) : (
              <View>
                {computeExampleSteps(operation as Operation, exampleQ.a, exampleQ.b, exampleQ.remainder, appLanguage).map(
                  (step, i) => (
                    <Text key={i} style={styles.stepText}>
                      {step}
                    </Text>
                  )
                )}
              </View>
            )}
          </>
        )}

        {page === 2 && (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.yourTurnContent}>
              <Text style={styles.header}>{copy.yourTurn}</Text>
              <View style={styles.exampleBox}>
                <Text style={styles.exampleText}>
                  {yourTurnQ.a} {opSymbol} {yourTurnQ.b} = ?
                </Text>
              </View>

              <TextInput
                style={styles.inputBox}
                placeholder={copy.placeholder}
                keyboardType="number-pad"
                value={userAnswer}
                onChangeText={setUserAnswer}
                editable={!isCorrect}
              />

              {isCorrect && <Text style={styles.feedbackText}>{copy.nice}</Text>}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => setShowAnswer(!showAnswer)}
                >
                  <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                    {showAnswer ? copy.hide : copy.showMe}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={handleCheck} disabled={!userAnswer.trim() || isCorrect}>
                  <Text style={styles.buttonText}>{copy.check}</Text>
                </TouchableOpacity>
              </View>

              {showAnswer && !isCorrect && (
                <View style={styles.hintContent}>
                  {isFactTier ? (
                    (() => {
                      const picker = getStrategyPicker();
                      if (!picker) return null;
                      const plan =
                        operation === "addition"
                          ? picker(yourTurnQ.a, yourTurnQ.b)
                          : operation === "subtraction"
                          ? picker(yourTurnQ.a, yourTurnQ.b)
                          : operation === "multiplication"
                          ? picker(yourTurnQ.a, yourTurnQ.b)
                          : picker(yourTurnQ.a, yourTurnQ.b);
                      return <StrategyView plan={plan} showStep2={false} />;
                    })()
                  ) : (
                    <View>
                      {computeExampleSteps(operation as Operation, yourTurnQ.a, yourTurnQ.b, yourTurnQ.remainder, appLanguage).map(
                        (step, i) => (
                          <Text key={i} style={styles.stepText}>
                            {step}
                          </Text>
                        )
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        )}

        {page === 3 && (
          <>
            <Text style={styles.header}>{copy.ready}</Text>
            <Text style={styles.subtitle}>{copy.readyPractice(tierLabel)}</Text>
          </>
        )}

        <View style={styles.navButtons}>
          {page === 0 && (
            <>
              <TouchableOpacity style={styles.navButton} onPress={() => setPage(1)}>
                <Text style={styles.navButtonText}>{copy.letsGo}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.navButton, { backgroundColor: "#f0f0f0" }]} onPress={handleSkip}>
                <Text style={[styles.navButtonText, { color: "#1a1a1a" }]}>{copy.skip}</Text>
              </TouchableOpacity>
            </>
          )}
          {page === 1 && (
            <TouchableOpacity style={styles.navButton} onPress={() => setPage(2)}>
              <Text style={styles.navButtonText}>{copy.gotIt}</Text>
            </TouchableOpacity>
          )}
          {page === 2 && (
            <TouchableOpacity style={styles.navButton} onPress={handleNext} disabled={!isCorrect}>
              <Text style={styles.navButtonText}>{copy.next}</Text>
            </TouchableOpacity>
          )}
          {page === 3 && (
            <TouchableOpacity style={styles.navButton} onPress={handleNext}>
              <Text style={styles.navButtonText}>{copy.start}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
