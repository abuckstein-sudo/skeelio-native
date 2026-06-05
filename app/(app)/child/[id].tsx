import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getSubjectMastery, TopicMastery } from "@/lib/mastery";
import { getWhatsNext, NextStep } from "@/lib/whatsNext";

const KNOWN_SUBJECTS = [
  "multiplication",
  "division",
  "addition",
  "subtraction",
  "spelling",
  "reading",
  "conjugation",
  "word_problems",
];

interface Child {
  id: string;
  name: string;
  grade_level: string;
}

interface CategorizedMastery {
  strengths: Array<[string, TopicMastery]>;
  building: Array<[string, TopicMastery]>;
  notStarted: string[];
  neverTried: string[];
}

export default function ChildHomeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [mastery, setMastery] = useState<Record<string, TopicMastery>>({});
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMasteryLoading, setIsMasteryLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      fetchChild();
    }
  }, [id]);

  const fetchChild = async () => {
    if (!id) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level")
      .eq("id", id)
      .single();

    if (dbError) {
      console.log("[nav] child fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    console.log("[nav] child loaded:", id);
    setChild(data);
    setIsLoading(false);

    // Fetch mastery data
    setIsMasteryLoading(true);
    const masteryData = await getSubjectMastery(id);
    console.log("[MASTERY_RAW]", JSON.stringify(masteryData, null, 2));
    setMastery(masteryData);

    // Convert to MasteryRow[] for whatsNext logic
    const rows = Object.entries(masteryData).map(([topic, data]) => ({
      topic,
      score: data.score / 100, // Convert 0–100 to 0–1
      attempts: data.totalQuestionAttempts,
    }));
    console.log("[MASTERY_MAPPED]", JSON.stringify(rows, null, 2));
    const step = getWhatsNext(rows);
    console.log("[whatsnext]", step);
    setNextStep(step);

    setIsMasteryLoading(false);
  };

  const handleBack = () => {
    console.log("[nav] back to children");
    router.push("/children");
  };

  const handleWhatsNext = () => {
    if (nextStep && child) {
      console.log("[whatsnext]", nextStep);
      router.push({
        pathname: "/practice",
        params: { childId: child.id, topic: nextStep.topic },
      });
    }
  };

  const categorizeMastery = (): CategorizedMastery => {
    const strengths: Array<[string, TopicMastery]> = [];
    const building: Array<[string, TopicMastery]> = [];
    const notStarted: string[] = [];

    Object.entries(mastery).forEach(([topic, data]) => {
      if (data.totalQuestionAttempts === 0) {
        notStarted.push(topic);
      } else if (data.score >= 80) {
        strengths.push([topic, data]);
      } else {
        building.push([topic, data]);
      }
    });

    // Sort by score for building (lowest first for suggestion)
    building.sort((a, b) => a[1].score - b[1].score);

    // Find never-tried subjects: KNOWN_SUBJECTS with no DB data at all
    const neverTried = KNOWN_SUBJECTS.filter((subject) => !mastery[subject]);

    return { strengths, building, notStarted, neverTried };
  };

  const getSuggestion = (categories: CategorizedMastery): string => {
    // Priority 1: Never-tried subjects (always invite them)
    if (categories.neverTried.length > 0) {
      const [topic] = categories.neverTried;
      return `${child?.name} hasn't tried ${topic} yet — want to start a session?`;
    }

    // Priority 2: Building topics (lowest-scoring first)
    if (categories.building.length > 0) {
      const [topic] = categories.building[0];
      return `💡 A great focus this week: ${topic}.`;
    }

    // Priority 3: Everything is practiced and strong — suggest leveling up
    const multiplicationStrong =
      mastery.multiplication && mastery.multiplication.score >= 80;
    const divisionStrong = mastery.division && mastery.division.score >= 80;
    const additionStrong = mastery.addition && mastery.addition.score >= 80;

    if (multiplicationStrong) {
      return `${child?.name}'s mastered his times tables — he may be ready for multi-digit multiplication or division.`;
    }

    if (divisionStrong) {
      return `${child?.name}'s doing great with division — he may be ready for more complex problem types.`;
    }

    if (additionStrong) {
      return `${child?.name}'s strong with addition — ready to explore larger numbers or new operations.`;
    }

    return `💡 Wonderful progress! ${child?.name} is ready for new challenges.`;
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!child || error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorText}>{error || "Child not found"}</Text>
        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isMasteryLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const categories = categorizeMastery();
  const hasData = Object.keys(mastery).length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerName}>
          {child.name} · {child.grade_level}
        </Text>
      </View>

      {hasData && nextStep && (
        <TouchableOpacity style={styles.whatsnextCard} onPress={handleWhatsNext}>
          <Text style={styles.whatsnextHeadline}>{nextStep.headline}</Text>
          <View style={styles.whatsnextCTAContainer}>
            <Text style={styles.whatsnextCTA}>{nextStep.cta}</Text>
          </View>
        </TouchableOpacity>
      )}

      {!hasData ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>
            No practice data yet. Come back after your first practice session!
          </Text>
        </View>
      ) : (
        <>
          {/* Summary */}
          <Text style={styles.summary}>
            {child.name} is practicing across {Object.keys(mastery).length} subjects. Here's where things stand.
          </Text>

          {/* Strengths Section */}
          {categories.strengths.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Doing well</Text>
              {categories.strengths.map(([topic, data]) => (
                <View key={topic} style={styles.strengthRow}>
                  <Text style={styles.topicName}>{topic}</Text>
                  <Text style={styles.strengthScore}>{data.score}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* Building Section */}
          {categories.building.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Still building</Text>
              {categories.building.map(([topic, data]) => (
                <View key={topic} style={styles.buildingRow}>
                  <View style={styles.buildingInfo}>
                    <Text style={styles.topicName}>{topic}</Text>
                    {data.weakest && (
                      <Text style={styles.weakestSkill}>working on {data.weakest}</Text>
                    )}
                  </View>
                  <Text style={styles.buildingScore}>{data.score}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* Not Started Section (combines never-tried + zero-attempt topics) */}
          {(categories.notStarted.length > 0 || categories.neverTried.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ready to explore</Text>
              {categories.neverTried.map((topic) => (
                <View key={topic} style={styles.notStartedRow}>
                  <Text style={styles.topicName}>{topic}</Text>
                  <Text style={styles.notStartedHint}>Ready when you are</Text>
                </View>
              ))}
              {categories.notStarted.map((topic) => (
                <View key={topic} style={styles.notStartedRow}>
                  <Text style={styles.topicName}>{topic}</Text>
                  <Text style={styles.notStartedHint}>Ready when you are</Text>
                </View>
              ))}
            </View>
          )}

          {/* Suggestion */}
          <View style={styles.suggestionBox}>
            <Text style={styles.suggestionText}>{getSuggestion(categories)}</Text>
          </View>

          {/* Caption */}
          <Text style={styles.caption}>Based on practice so far</Text>
        </>
      )}

      {/* Actions */}
      <TouchableOpacity style={styles.button} onPress={handleBack}>
        <Text style={styles.buttonText}>Back to Who's Learning?</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
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
  headerName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  summary: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 28,
    textAlign: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  strengthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f0f9f0",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    borderRadius: 6,
    marginBottom: 10,
  },
  buildingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fef8f0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    borderRadius: 6,
    marginBottom: 10,
  },
  notStartedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#bdbdbd",
    borderRadius: 6,
    marginBottom: 10,
  },
  notStartedHint: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
  buildingInfo: {
    flex: 1,
  },
  topicName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    textTransform: "capitalize",
  },
  weakestSkill: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
    fontStyle: "italic",
  },
  strengthScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4caf50",
  },
  buildingScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ff9800",
  },
  suggestionBox: {
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#2196f3",
  },
  suggestionText: {
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    color: "#aaa",
    textAlign: "center",
    marginBottom: 28,
  },
  emptySection: {
    paddingVertical: 40,
    paddingHorizontal: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 28,
  },
  emptyText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#d32f2f",
    marginBottom: 20,
    textAlign: "center",
  },
  whatsnextCard: {
    backgroundColor: "#fffbf0",
    borderLeftWidth: 4,
    borderLeftColor: "#d4a574",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  whatsnextHeadline: {
    fontSize: 15,
    color: "#1a1a1a",
    lineHeight: 22,
    marginBottom: 12,
  },
  whatsnextCTAContainer: {
    backgroundColor: "#d4a574",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  whatsnextCTA: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
