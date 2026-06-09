import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, FlatList, SafeAreaView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getOperationStatus, OperationStatus } from "@/lib/tutor/status";
import { Operation } from "@/lib/tutorConfig";
import { listAssignmentsForChild, Assignment } from "@/lib/assignments";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  selected_avatar?: string;
}

const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

interface SubjectTile {
  topic: string;
  label: string;
  description: string;
  isActive: boolean;
}

const SUBJECTS: SubjectTile[] = [
  { topic: "multiplication", label: "Multiplication", description: "Master times tables", isActive: true },
  { topic: "division", label: "Division", description: "Learn to divide numbers", isActive: true },
  { topic: "addition", label: "Addition", description: "Add numbers together", isActive: true },
  { topic: "subtraction", label: "Subtraction", description: "Take numbers away", isActive: true },
  { topic: "word_problems", label: "Word Problems", description: "Solve real-world math", isActive: false },
  { topic: "spelling", label: "Spelling", description: "Spell words correctly", isActive: false },
  { topic: "reading", label: "Reading", description: "Read and understand", isActive: false },
  { topic: "conjugation", label: "Conjugation", description: "Learn verb forms", isActive: false },
];

export default function ChildHomeScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [stars, setStars] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [operationStatuses, setOperationStatuses] = useState<Record<Operation, OperationStatus>>({});
  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);

  const fetchStars = useCallback(async () => {
    if (!childId) return;

    console.log("[child-home] re-fetching stars on focus");
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", childId)
      .maybeSingle();

    console.log("[child-home] stars fetched:", rewardsData?.stars ?? 0);
    setStars(rewardsData?.stars ?? 0);
  }, [childId]);

  const fetchPendingAssignments = useCallback(async () => {
    if (!childId) return;
    const assignments = await listAssignmentsForChild(childId);
    const pending = assignments.filter((a) => a.status === "pending");
    setPendingAssignments(pending);
  }, [childId]);

  useEffect(() => {
    if (childId) {
      fetchChild();
    }
  }, [childId]);

  // Re-fetch stars and assignments when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchStars();
      fetchPendingAssignments();
    }, [fetchStars, fetchPendingAssignments])
  );

  const fetchChild = async () => {
    if (!childId) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, selected_avatar, max_addition_number, max_times_table, math_subtraction_level, math_division_level")
      .eq("id", childId)
      .single();

    if (dbError) {
      console.log("[child-home] fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    console.log("[child-home] child loaded:", childId);
    setChild(data as Child);

    // Fetch rewards (stars)
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", childId)
      .maybeSingle();

    setStars(rewardsData?.stars ?? 0);

    // Fetch tier-based operation statuses
    const mathOperations: Operation[] = ["addition", "subtraction", "multiplication", "division"];
    const statuses: Record<Operation, OperationStatus> = {} as any;
    for (const op of mathOperations) {
      const status = await getOperationStatus(childId, op, data || {});
      statuses[op] = status;
    }
    setOperationStatuses(statuses);

    setIsLoading(false);
  };

  const handleSubjectTap = (topic: string) => {
    if (childId) {
      console.log("[child-home] topic selected:", topic);
      router.push({
        pathname: "/practice",
        params: { topic, childId },
      });
    }
  };

  const handleHomeworkTap = (assignmentId: string) => {
    console.log("[child-home] homework assignment selected:", assignmentId);
    router.push({
      pathname: "/homework/[assignmentId]",
      params: { assignmentId, childId },
    });
  };

  const handleAllDone = () => {
    console.log("[child-home] back to hub");
    router.push("/children");
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
        <Text style={styles.errorTitle}>Oops!</Text>
        <Text style={styles.errorText}>{error || "Child not found"}</Text>
        <TouchableOpacity style={styles.button} onPress={handleAllDone}>
          <Text style={styles.buttonText}>Back to Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleAllDone}>
          <Text style={styles.allDoneText}>All done</Text>
        </TouchableOpacity>
      </View>

      {/* Greeting */}
      <View style={styles.greetingBanner}>
        {child.selected_avatar && (
          <Text style={styles.avatarEmoji}>
            {AVATAR_EMOJI[child.selected_avatar] || AVATAR_EMOJI.fox}
          </Text>
        )}
        <Text style={styles.greetingText}>Hi {child.name}! Ready to learn?</Text>
        <Text style={styles.starsText}>⭐ {stars}</Text>
      </View>

      {/* Homework Section */}
      {pendingAssignments.length > 0 && (
        <View style={styles.homeworkSection}>
          <Text style={styles.homeworkSectionTitle}>📋 Homework</Text>
          {pendingAssignments.map((assignment) => (
            <TouchableOpacity
              key={assignment.id}
              style={styles.homeworkCard}
              onPress={() => handleHomeworkTap(assignment.id)}
            >
              <View style={styles.homeworkInfo}>
                <Text style={styles.homeworkCardTopic}>
                  {(assignment.focus || assignment.subject || "Practice").charAt(0).toUpperCase() +
                    (assignment.focus || assignment.subject || "Practice").slice(1)}
                </Text>
                <Text style={styles.homeworkCardCount}>
                  {assignment.question_count} question{assignment.question_count !== 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={styles.playButton}>▶</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Show practice tiles only if no pending homework */}
      {pendingAssignments.length === 0 && (
        <View style={styles.subjectsContainer}>
          {SUBJECTS.map((subject) => {
            const isMathSubject = ["addition", "subtraction", "multiplication", "division"].includes(subject.topic);
            const operationStatus = isMathSubject ? operationStatuses[subject.topic as Operation] : null;

            return (
              <TouchableOpacity
                key={subject.topic}
                style={[styles.subjectTile, !subject.isActive && styles.subjectTileInactive]}
                onPress={() => subject.isActive && handleSubjectTap(subject.topic)}
                disabled={!subject.isActive}
              >
                <Text style={styles.subjectLabel}>{subject.label}</Text>
                <Text style={styles.subjectDescription}>{subject.description}</Text>
                {operationStatus && (
                  <Text style={styles.statusText}>{operationStatus.childHomeText}</Text>
                )}
                {!subject.isActive && <Text style={styles.comingSoonLabel}>Coming soon</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: 24,
  },
  allDoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
  },
  greetingBanner: {
    backgroundColor: "#f0f8ff",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 32,
  },
  avatarEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 6,
  },
  starsText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffc107",
  },
  subjectsContainer: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  subjectTile: {
    width: "48%",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  subjectTileInactive: {
    opacity: 0.7,
  },
  subjectLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 6,
    textAlign: "center",
  },
  subjectDescription: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 16,
  },
  comingSoonLabel: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    marginTop: 8,
  },
  statusText: {
    fontSize: 11,
    color: "#2196f3",
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 14,
  },
  button: {
    backgroundColor: "#0000ff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
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
  homeworkSection: {
    backgroundColor: "#fef3e0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  homeworkSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  homeworkCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffe0b2",
  },
  homeworkInfo: {
    flex: 1,
  },
  homeworkCardTopic: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  homeworkCardCount: {
    fontSize: 12,
    color: "#666",
  },
  playButton: {
    fontSize: 20,
    marginLeft: 12,
  },
});
