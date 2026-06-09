import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../_layout";
import { getSubjectMastery, TopicMastery } from "@/lib/mastery";
import { getWhatsNext, NextStep } from "@/lib/whatsNext";
import { getOperationStatus, OperationStatus } from "@/lib/tutor/status";
import { Operation } from "@/lib/tutorConfig";
import {
  listAssignmentsForChild,
  createMathAssignment,
  Assignment,
} from "@/lib/assignments";

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

interface ChildOption {
  id: string;
  name: string;
}

interface CategorizedMastery {
  strengths: Array<[string, TopicMastery]>;
  building: Array<[string, TopicMastery]>;
  notStarted: string[];
  neverTried: string[];
}

export default function ChildHomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [allChildren, setAllChildren] = useState<ChildOption[]>([]);
  const [mastery, setMastery] = useState<Record<string, TopicMastery>>({});
  const [operationStatuses, setOperationStatuses] = useState<
    Record<Operation, OperationStatus>
  >({});
  const [nextStep, setNextStep] = useState<NextStep | null>(null);
  const [todayPracticeCount, setTodayPracticeCount] = useState(0);
  const [stars, setStars] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMasteryLoading, setIsMasteryLoading] = useState(false);
  const [error, setError] = useState("");

  // Homework assignment state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Operation>("addition");
  const [questionCount, setQuestionCount] = useState(8);
  const [dueDate, setDueDate] = useState("");
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);

  const fetchStars = useCallback(async () => {
    if (!id) return;

    console.log("[parent-dashboard] re-fetching stars on focus");
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", id)
      .maybeSingle();

    console.log("[parent-dashboard] stars fetched:", rewardsData?.stars ?? 0);
    setStars(rewardsData?.stars ?? 0);
  }, [id]);

  const fetchAssignments = useCallback(async () => {
    if (!id) return;
    const assns = await listAssignmentsForChild(id);
    setAssignments(assns);
  }, [id]);

  const handleCreateAssignment = async () => {
    if (!id || !session?.user?.id) return;

    setIsCreatingAssignment(true);
    try {
      await createMathAssignment({
        childId: id,
        parentId: session.user.id,
        topic: selectedTopic,
        count: questionCount,
        dueDate: dueDate || undefined,
      });

      // Refresh assignments
      await fetchAssignments();

      // Reset form
      setShowAssignmentForm(false);
      setSelectedTopic("addition");
      setQuestionCount(8);
      setDueDate("");
    } catch (err) {
      console.error("[assignments] error creating:", err);
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  useEffect(() => {
    if (id && session?.user?.id) {
      fetchChild();
    }
  }, [id, session?.user?.id]);

  // Re-fetch stars and assignments when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchStars();
      fetchAssignments();
    }, [fetchStars, fetchAssignments]),
  );

  const fetchChild = async () => {
    if (!id || !session?.user?.id) return;

    setIsLoading(true);
    setError("");

    // Fetch current child
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

    // Fetch all children for switcher
    const { data: childrenData } = await supabase
      .from("children")
      .select("id, name")
      .eq("parent_id", session.user.id);

    if (childrenData) {
      setAllChildren(childrenData);
    }

    // Fetch today's practice count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: attemptsData } = await supabase
      .from("learning_attempts")
      .select("id", { count: "exact" })
      .eq("child_id", id)
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString());

    if (attemptsData) {
      setTodayPracticeCount(attemptsData.length);
    }

    // Fetch rewards (stars)
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", id)
      .maybeSingle();

    setStars(rewardsData?.stars ?? 0);

    // Fetch assignments
    const assns = await listAssignmentsForChild(id);
    setAssignments(assns);

    setIsLoading(false);

    // Fetch mastery data
    setIsMasteryLoading(true);
    const masteryData = await getSubjectMastery(id);
    console.log("[MASTERY_RAW]", JSON.stringify(masteryData, null, 2));
    setMastery(masteryData);

    // Fetch tier-based operation statuses for math subjects
    const mathOperations: Operation[] = [
      "addition",
      "subtraction",
      "multiplication",
      "division",
    ];
    const statuses: Record<Operation, OperationStatus> = {} as any;
    for (const op of mathOperations) {
      const status = await getOperationStatus(id, op, data || {});
      statuses[op] = status;
    }
    setOperationStatuses(statuses);

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

  const handleSwitchChild = (childId: string) => {
    if (childId !== id) {
      console.log("[nav] switch to child:", childId);
      router.push({
        pathname: "/child/[id]",
        params: { id: childId },
      });
    }
  };

  const handleEditSettings = () => {
    if (child) {
      console.log("[nav] edit settings:", child.id);
      router.push({
        pathname: "/child-settings/[childId]",
        params: { childId: child.id, mode: "edit" },
      });
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.log("[auth] signout error:", error.message);
      return;
    }
    console.log("[auth] signed out");
    // Auth state change will trigger redirect to login
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

  const handleScanWorksheet = () => {
    if (child) {
      router.push({
        pathname: "/scan",
        params: { childId: child.id },
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Top Chrome */}
        <View style={styles.topChrome}>
          {/* Child Switcher */}
          <View style={styles.childSwitcher}>
            <Text style={styles.childSwitcherLabel}>Child:</Text>
            <View style={styles.childSwitcherButtons}>
              {allChildren.map((childOption) => (
                <TouchableOpacity
                  key={childOption.id}
                  style={[
                    styles.childSwitcherButton,
                    childOption.id === id && styles.childSwitcherButtonActive,
                  ]}
                  onPress={() => handleSwitchChild(childOption.id)}
                >
                  <Text
                    style={[
                      styles.childSwitcherButtonText,
                      childOption.id === id &&
                        styles.childSwitcherButtonTextActive,
                    ]}
                  >
                    {childOption.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Today's Practice & Stars */}
          <View style={styles.todayPractice}>
            <Text style={styles.todayPracticeText}>
              Practiced today: {todayPracticeCount}
            </Text>
            <Text style={styles.starsText}>⭐ {stars}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsTop}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleEditSettings}
            >
              <Text style={styles.actionButtonText}>
                Edit {child?.name}'s settings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSignOut}
            >
              <Text style={styles.actionButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerName}>Parent dashboard</Text>
        </View>

        {hasData && nextStep && (
          <TouchableOpacity
            style={styles.whatsnextCard}
            onPress={handleWhatsNext}
          >
            <Text style={styles.whatsnextHeadline}>{nextStep.headline}</Text>
            <View style={styles.whatsnextCTAContainer}>
              <Text style={styles.whatsnextCTA}>{nextStep.cta}</Text>
            </View>
          </TouchableOpacity>
        )}

        {!hasData &&
        Object.keys(operationStatuses).every(
          (op) => !operationStatuses[op as Operation]?.hasAttempts,
        ) ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>
              No practice data yet. Come back after your first practice session!
            </Text>
          </View>
        ) : (
          <>
            {/* Homework Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Homework</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowAssignmentForm(true)}
                >
                  <Text style={styles.addButtonText}>+ Assign</Text>
                </TouchableOpacity>
              </View>
              {assignments.length === 0 ? (
                <Text style={styles.emptyItemText}>No assignments yet</Text>
              ) : (
                assignments.map((asn) => (
                  <View
                    key={asn.id}
                    style={[
                      styles.homeworkRow,
                      asn.status === "completed" && styles.homeworkRowCompleted,
                    ]}
                  >
                    <View style={styles.homeworkInfo}>
                      <Text style={styles.homeworkTopic}>
                        {asn.focus.charAt(0).toUpperCase() + asn.focus.slice(1)}
                      </Text>
                      <Text style={styles.homeworkDetails}>
                        {asn.question_count} questions
                        {asn.due_date &&
                          ` • Due: ${new Date(asn.due_date).toLocaleDateString()}`}
                      </Text>
                      {asn.status === "completed" && asn.completed_at && (
                        <Text style={styles.completedDate}>
                          Completed:{" "}
                          {new Date(asn.completed_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        asn.status === "completed"
                          ? styles.statusCompleted
                          : styles.statusActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          asn.status === "completed" &&
                            styles.statusBadgeTextCompleted,
                        ]}
                      >
                        {asn.status === "completed" ? "✓" : "→"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Math Operations Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Math Progress</Text>
              {(
                [
                  "addition",
                  "subtraction",
                  "multiplication",
                  "division",
                ] as Operation[]
              ).map((op) => {
                const status = operationStatuses[op];
                if (!status) return null;

                // Override text for needs-teach band
                let displayText = status.parentDashboardText;
                if (status.band === "needs-teach") {
                  displayText = `Ready to learn ${status.workingTierLabel}`;
                }

                return (
                  <View key={op} style={styles.operationRow}>
                    <View style={styles.operationInfo}>
                      <Text style={styles.topicName}>{op}</Text>
                      <Text style={styles.operationStatus}>{displayText}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Other Subjects Section */}
            {categories.strengths.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Doing well</Text>
                {categories.strengths
                  .filter(
                    ([topic]) =>
                      ![
                        "addition",
                        "subtraction",
                        "multiplication",
                        "division",
                      ].includes(topic),
                  )
                  .map(([topic, data]) => (
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
                {categories.building
                  .filter(
                    ([topic]) =>
                      ![
                        "addition",
                        "subtraction",
                        "multiplication",
                        "division",
                      ].includes(topic),
                  )
                  .map(([topic, data]) => (
                    <View key={topic} style={styles.buildingRow}>
                      <View style={styles.buildingInfo}>
                        <Text style={styles.topicName}>{topic}</Text>
                        {data.weakest && (
                          <Text style={styles.weakestSkill}>
                            working on {data.weakest}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.buildingScore}>{data.score}%</Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Not Started Section (combines never-tried + zero-attempt topics) */}
            {(categories.notStarted.length > 0 ||
              categories.neverTried.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ready to explore</Text>
                {categories.neverTried
                  .filter(
                    (topic) =>
                      ![
                        "addition",
                        "subtraction",
                        "multiplication",
                        "division",
                      ].includes(topic),
                  )
                  .map((topic) => (
                    <View key={topic} style={styles.notStartedRow}>
                      <Text style={styles.topicName}>{topic}</Text>
                      <Text style={styles.notStartedHint}>
                        Ready when you are
                      </Text>
                    </View>
                  ))}
                {categories.notStarted
                  .filter(
                    (topic) =>
                      ![
                        "addition",
                        "subtraction",
                        "multiplication",
                        "division",
                      ].includes(topic),
                  )
                  .map((topic) => (
                    <View key={topic} style={styles.notStartedRow}>
                      <Text style={styles.topicName}>{topic}</Text>
                      <Text style={styles.notStartedHint}>
                        Ready when you are
                      </Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Suggestion */}
            <View style={styles.suggestionBox}>
              <Text style={styles.suggestionText}>
                {getSuggestion(categories)}
              </Text>
            </View>

            {/* Caption */}
            <Text style={styles.caption}>Based on practice so far</Text>
          </>
        )}

        {/* Actions */}
        <TouchableOpacity style={styles.button} onPress={handleScanWorksheet}>
          <Text style={styles.buttonText}>Scan a worksheet</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleEditSettings}>
          <Text style={styles.buttonText}>Edit {child?.name}'s settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleBack}>
          <Text style={styles.buttonText}>Back to Hub</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Assignment Form Modal */}
      <Modal
        visible={showAssignmentForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() =>
          !isCreatingAssignment && setShowAssignmentForm(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Homework</Text>

            {/* Topic Picker */}
            <Text style={styles.formLabel}>Topic</Text>
            <View style={styles.topicPickerRow}>
              {["addition", "subtraction", "multiplication", "division"].map(
                (topic) => (
                  <TouchableOpacity
                    key={topic}
                    style={[
                      styles.topicButton,
                      selectedTopic === topic && styles.topicButtonActive,
                    ]}
                    onPress={() => setSelectedTopic(topic as Operation)}
                  >
                    <Text
                      style={[
                        styles.topicButtonText,
                        selectedTopic === topic && styles.topicButtonTextActive,
                      ]}
                    >
                      {topic.charAt(0).toUpperCase() + topic.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            {/* Question Count */}
            <Text style={styles.formLabel}>Number of Questions</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() => setQuestionCount(Math.max(1, questionCount - 1))}
              >
                <Text style={styles.counterButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{questionCount}</Text>
              <TouchableOpacity
                style={styles.counterButton}
                onPress={() =>
                  setQuestionCount(Math.min(20, questionCount + 1))
                }
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Due Date (optional) */}
            <Text style={styles.formLabel}>Due Date (optional)</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD"
              value={dueDate}
              onChangeText={setDueDate}
              editable={!isCreatingAssignment}
            />

            {/* Action Buttons */}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.button,
                  !isCreatingAssignment && styles.buttonSecondary,
                ]}
                onPress={() =>
                  !isCreatingAssignment && setShowAssignmentForm(false)
                }
                disabled={isCreatingAssignment}
              >
                <Text style={[styles.buttonText, styles.buttonSecondaryText]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleCreateAssignment}
                disabled={isCreatingAssignment}
              >
                {isCreatingAssignment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Assignment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  topChrome: {
    backgroundColor: "#f9f9f9",
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  childSwitcher: {
    marginBottom: 12,
  },
  childSwitcherLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  childSwitcherButtons: {
    flexDirection: "row",
    gap: 8,
  },
  childSwitcherButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  childSwitcherButtonActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  childSwitcherButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  childSwitcherButtonTextActive: {
    color: "#2196f3",
  },
  todayPractice: {
    marginBottom: 12,
  },
  todayPracticeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  starsText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffc107",
  },
  actionButtonsTop: {
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
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
  operationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f0f8ff",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    borderRadius: 6,
    marginBottom: 10,
  },
  operationInfo: {
    flex: 1,
  },
  operationStatus: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 18,
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
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  homeworkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    borderRadius: 6,
    marginBottom: 10,
  },
  homeworkRowCompleted: {
    backgroundColor: "#f0f9f0",
    borderLeftColor: "#4caf50",
    opacity: 0.7,
  },
  homeworkInfo: {
    flex: 1,
  },
  homeworkTopic: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  homeworkDetails: {
    fontSize: 12,
    color: "#666",
  },
  completedDate: {
    fontSize: 11,
    color: "#4caf50",
    fontWeight: "600",
    marginTop: 4,
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  statusActive: {
    backgroundColor: "#e3f2fd",
  },
  statusCompleted: {
    backgroundColor: "#e8f5e9",
  },
  statusBadgeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2196f3",
  },
  statusBadgeTextCompleted: {
    color: "#4caf50",
  },
  emptyItemText: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 20,
    textAlign: "center",
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  topicPickerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  topicButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  topicButtonActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  topicButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  topicButtonTextActive: {
    color: "#2196f3",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    justifyContent: "center",
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
  },
  counterButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2196f3",
  },
  counterValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    minWidth: 40,
    textAlign: "center",
  },
  dateInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 20,
    color: "#333",
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  buttonSecondary: {
    backgroundColor: "#f0f0f0",
    flex: 1,
  },
  buttonSecondaryText: {
    color: "#666",
  },
  buttonPrimary: {
    backgroundColor: "#2196f3",
    flex: 1,
  },
});
