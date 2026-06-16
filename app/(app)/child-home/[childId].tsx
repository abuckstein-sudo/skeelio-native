import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, FlatList, SafeAreaView, Modal } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getOperationStatus, OperationStatus, getWordProblemsStatus, WordProblemsStatus } from "@/lib/tutor/status";
import { Operation } from "@/lib/tutorConfig";
import { listAssignmentsForChild, Assignment } from "@/lib/assignments";
import { listSpellingListsForChild, type SpellingList } from "@/lib/spelling";
import {
  listWorksheetSkillsForChild,
  worksheetSkillLabel,
  worksheetSkillProgressText,
  WorksheetSkill,
} from "@/lib/worksheetSkills";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GiraffeBackground from "@/components/GiraffeBackground";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  selected_avatar?: string;
  home_background?: string;
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
  { topic: "word_problems", label: "Word Problems", description: "Solve real-world math", isActive: true },
  { topic: "spelling", label: "Spelling", description: "Spell words correctly", isActive: true },
  { topic: "conjugation", label: "Conjugation", description: "Learn French verb forms", isActive: true },
  { topic: "reading", label: "Reading", description: "Read and understand", isActive: false },
];

const AVATAR_OPTIONS = ["cat", "owl", "fox", "bear", "rabbit", "panda"];
const BACKGROUND_OPTIONS = [
  { id: "giraffe", label: "Giraffe", color: null },
  { id: "blue", label: "Blue", color: "#6FB0E0" },
  { id: "red", label: "Red", color: "#E8857E" },
  { id: "green", label: "Green", color: "#6FC089" },
];

export default function ChildHomeScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [stars, setStars] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [operationStatuses, setOperationStatuses] = useState<Record<Operation, OperationStatus>>(
    {} as Record<Operation, OperationStatus>
  );
  const [wordProblemsStatus, setWordProblemsStatus] = useState<WordProblemsStatus | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);
  const [completedAssignments, setCompletedAssignments] = useState<Assignment[]>([]);
  const [spellingLists, setSpellingLists] = useState<SpellingList[]>([]);
  const [pendingEpisodes, setPendingEpisodes] = useState<any[]>([]);
  const [completedWorksheetSkills, setCompletedWorksheetSkills] = useState<WorksheetSkill[]>([]);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"avatar" | "background">("avatar");
  const skipNextFocusFeedRefreshRef = useRef(false);

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
    const completed = assignments
      .filter((a) => a.status === "complete")
      .sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);
    setPendingAssignments(pending);
    setCompletedAssignments(completed);

    // Fetch spelling lists
    try {
      const lists = await listSpellingListsForChild(childId);
      setSpellingLists(lists);
    } catch (err) {
      console.error("[child-home] failed to fetch spelling lists:", err);
    }
  }, [childId]);

  const fetchPendingEpisodes = useCallback(async () => {
    if (!childId) return;
    try {
      const { data, error: dbError } = await supabase
        .from("tutor_episodes")
        .select("id, concept, lesson, domain, language, grade_band, created_at, status")
        .eq("child_id", childId)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: true });

      if (dbError) {
        console.error("[child-home] failed to fetch pending episodes:", dbError);
        setPendingEpisodes([]);
      } else {
        setPendingEpisodes(data || []);
      }
    } catch (err) {
      console.error("[child-home] failed to fetch pending episodes:", err);
      setPendingEpisodes([]);
    }
  }, [childId]);

  const fetchCompletedWorksheetSkills = useCallback(async () => {
    if (!childId) return;
    const skills = await listWorksheetSkillsForChild(childId);
    setCompletedWorksheetSkills(
      skills
        .filter((skill) => skill.status === "complete")
        .sort((a, b) => {
          const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 5)
    );
  }, [childId]);

  const refreshHomeworkFeed = useCallback(async () => {
    await Promise.all([
      fetchPendingAssignments(),
      fetchPendingEpisodes(),
      fetchCompletedWorksheetSkills(),
    ]);
  }, [fetchPendingAssignments, fetchPendingEpisodes, fetchCompletedWorksheetSkills]);

  useEffect(() => {
    if (childId) {
      skipNextFocusFeedRefreshRef.current = true;
      fetchChild();
      refreshHomeworkFeed();
    }
  }, [childId, refreshHomeworkFeed]);

  // Re-fetch stars, assignments, and episodes when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchStars();
      if (skipNextFocusFeedRefreshRef.current) {
        skipNextFocusFeedRefreshRef.current = false;
        return;
      }
      refreshHomeworkFeed();
    }, [fetchStars, refreshHomeworkFeed])
  );

  const fetchChild = async () => {
    if (!childId) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, selected_avatar, home_background, max_addition_number, max_times_table, math_subtraction_level, math_division_level")
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

    // Fetch word problems status
    const wpStatus = await getWordProblemsStatus(childId, data || {});
    setWordProblemsStatus(wpStatus);

    setIsLoading(false);
  };

  const handleSubjectTap = async (topic: string) => {
    if (childId) {
      console.log("[child-home] topic selected:", topic);
      if (topic === "word_problems") {
        router.push({
          pathname: "/word-problems/[childId]",
          params: { childId },
        });
      } else if (topic === "spelling") {
        router.push({
          pathname: "/spelling-lists/[childId]",
          params: { childId },
        });
      } else if (topic === "conjugation") {
        // Create a new conjugation session
        try {
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData.user?.id;
          if (!userId) return;

          // Fetch child grade level
          const { data: childData, error: childErr } = await supabase
            .from("children")
            .select("grade_level")
            .eq("id", childId)
            .single();

          if (childErr) throw childErr;
          const gradeLevel = childData?.grade_level || "CE1";

          // Fetch pool first to ensure questions are available
          const { fetchConjugationPool, createConjugationSession } = await import("@/lib/conjugation");
          const pool = await fetchConjugationPool(childId, gradeLevel);

          if (pool.length === 0) {
            alert("No conjugation questions available for this grade level");
            return;
          }

          // Only create session if pool is non-empty
          const session = await createConjugationSession(childId, userId, Math.min(10, pool.length));

          router.push({
            pathname: "/conjugation/[sessionId]",
            params: { sessionId: session.id, childId },
          });
        } catch (err) {
          console.error("[child-home] failed to create conjugation session:", err);
          alert("Failed to start conjugation session");
        }
      } else {
        router.push({
          pathname: "/practice",
          params: { topic, childId },
        });
      }
    }
  };

  const handleHomeworkTap = async (assignmentId: string) => {
    console.log("[child-home] homework assignment selected:", assignmentId);

    // Find the assignment to check its type
    const assignment = pendingAssignments.find((a) => a.id === assignmentId);

    if (assignment?.subject === "spelling") {
      // Route to spelling session with assignmentId and mode
      const listId = (assignment.custom_questions as any)?.list_id;
      const mode = assignment.mode || "practice";
      router.push({
        pathname: "/spelling/[listId]",
        params: { listId, childId, assignmentId, mode },
      });
    } else if (assignment?.subject === "conjugation") {
      // Create conjugation session for homework
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) return;

        const { createConjugationSession } = await import("@/lib/conjugation");
        const session = await createConjugationSession(childId, userId, assignment.question_count || 10);

        router.push({
          pathname: "/conjugation/[sessionId]",
          params: { sessionId: session.id, childId, assignmentId },
        });
      } catch (err) {
        console.error("[child-home] failed to create conjugation homework session:", err);
        alert("Failed to start conjugation homework");
      }
    } else {
      // Route to homework for math assignments
      router.push({
        pathname: "/homework/[assignmentId]",
        params: { assignmentId, childId },
      });
    }
  };

  const handleShopPress = () => {
    router.push({
      pathname: "/star-shop/[childId]",
      params: { childId },
    });
  };

  const handleEpisodeTap = (episode: any) => {
    console.log("[child-home] episode selected:", episode.id);

    const episodeData = JSON.stringify({
      concept: episode.concept,
      lesson: episode.lesson,
      grade_band: episode.grade_band || "",
      language: episode.language,
      domain: episode.domain,
    });

    router.push({
      pathname: "/(app)/episode",
      params: {
        data: episodeData,
        episodeId: episode.id,
        childId: childId,
      },
    });
  };

  const handleAvatarSelect = async (avatarId: string) => {
    if (!child) return;
    try {
      await supabase
        .from("children")
        .update({ selected_avatar: avatarId })
        .eq("id", childId);
      setChild({ ...child, selected_avatar: avatarId });
      console.log("[child-home] avatar updated:", avatarId);
    } catch (err) {
      console.error("[child-home] failed to update avatar:", err);
    }
  };

  const handleBackgroundSelect = async (bgId: string) => {
    if (!child) return;
    try {
      await supabase
        .from("children")
        .update({ home_background: bgId })
        .eq("id", childId);
      setChild({ ...child, home_background: bgId });
      console.log("[child-home] background updated:", bgId);
    } catch (err) {
      console.error("[child-home] failed to update background:", err);
    }
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

  const backgroundKey = child?.home_background || "giraffe";
  const bgOption = BACKGROUND_OPTIONS.find((bg) => bg.id === backgroundKey);

  // One unified "Homework" feed: worksheet practice sessions (episodes) +
  // assigned work, ordered by when they were created/assigned.
  const homeworkFeed = [
    ...pendingEpisodes.map((e) => ({
      type: "episode" as const,
      id: e.id as string,
      createdAt: (e.created_at as string) || "",
      title: e.concept?.label || "Practice",
      subtitle: e.status === "in_progress" ? "Reprendre" : "À faire",
      episode: e,
    })),
    ...pendingAssignments.map((a) => {
      const isSpelling = a.subject === "spelling";
      const base = (a.focus || a.subject || "Practice") as string;
      const title = isSpelling
        ? `Spelling: ${(a.custom_questions as any)?.title || "Spelling List"}`
        : base.charAt(0).toUpperCase() + base.slice(1);
      const count = a.question_count;
      return {
        type: "assignment" as const,
        id: a.id as string,
        createdAt: ((a as any).created_at as string) || "",
        title,
        subtitle: `${count} ${isSpelling ? "word" : "question"}${count !== 1 ? "s" : ""}`,
        episode: null as any,
      };
    }),
  ].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));

  const completedHomeworkFeed = [
    ...completedWorksheetSkills.map((skill) => ({
      type: "worksheet" as const,
      id: skill.id,
      title: worksheetSkillLabel(skill),
      completedAt: skill.completed_at,
      subtitle: worksheetSkillProgressText(skill),
    })),
    ...completedAssignments.map((a) => {
      const isSpelling = a.subject === "spelling";
      const base = (a.focus || a.subject || "Practice") as string;
      const title = isSpelling
        ? `Spelling: ${(a.custom_questions as any)?.title || "Spelling List"}`
        : base.charAt(0).toUpperCase() + base.slice(1);
      return {
        id: a.id,
        title,
        completedAt: a.completed_at,
        subtitle: typeof a.correct_count === "number"
          ? `Score: ${a.correct_count}/${a.question_count}`
          : `${a.question_count} ${isSpelling ? "word" : "question"}${a.question_count !== 1 ? "s" : ""}`,
      };
    }),
  ].sort((a, b) => {
    const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return dateB - dateA;
  }).slice(0, 5);

  return (
    <SafeAreaView style={styles.container}>
      {/* Background */}
      {backgroundKey === "giraffe" ? (
        <GiraffeBackground />
      ) : (
        <View style={[styles.solidBackground, { backgroundColor: bgOption?.color || "#fff" }]} />
      )}

      <ScrollView contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftCluster}>
          <TouchableOpacity onPress={handleAllDone} style={styles.allDoneButton}>
            <Text style={styles.allDoneText}>All done</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSettingsModalVisible(true)}>
            <MaterialCommunityIcons name="cog" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.topRightCluster}>
          <Text style={styles.starsText}>⭐ {stars}</Text>
          <TouchableOpacity onPress={handleShopPress} style={styles.shopButton}>
            <Text style={styles.shopIcon}>🛒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greetingBanner}>
        {child.selected_avatar && (
          <Text style={styles.avatarEmoji}>
            {AVATAR_EMOJI[child.selected_avatar] || AVATAR_EMOJI.fox}
          </Text>
        )}
        <Text style={styles.greetingText}>
          Hi {child.name}! {pendingAssignments.length > 0 || pendingEpisodes.length > 0 ? "Let's get started!" : "What would you like to work on today?"}
        </Text>
      </View>

      {/* Homework Section (worksheet practice + assigned work, one feed) */}
      {homeworkFeed.length > 0 && (
        <View style={styles.homeworkSection}>
          <Text style={styles.homeworkSectionTitle}>📋 Homework</Text>
          {homeworkFeed.map((item) => (
            <TouchableOpacity
              key={`${item.type}-${item.id}`}
              style={styles.homeworkCard}
              onPress={() =>
                item.type === "episode"
                  ? handleEpisodeTap(item.episode)
                  : handleHomeworkTap(item.id)
              }
            >
              <View style={styles.homeworkInfo}>
                <Text style={styles.homeworkCardTopic} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.homeworkCardCount}>{item.subtitle}</Text>
              </View>
              <Text style={styles.playButton}>▶</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {completedHomeworkFeed.length > 0 && (
        <View style={styles.completedHomeworkSection}>
          <Text style={styles.homeworkSectionTitle}>✅ Finished</Text>
          {completedHomeworkFeed.map((item) => (
            <View key={item.id} style={styles.completedHomeworkCard}>
              <View style={styles.homeworkInfo}>
                <Text style={styles.homeworkCardTopic} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.homeworkCardCount}>
                  {item.subtitle}
                  {item.completedAt
                    ? ` • ${new Date(item.completedAt).toLocaleDateString()}`
                    : ""}
                </Text>
              </View>
              <Text style={styles.completedCheck}>✓</Text>
            </View>
          ))}
        </View>
      )}

      {/* Show practice tiles only if nothing is queued in the homework feed */}
      {homeworkFeed.length === 0 && (
        <View style={styles.subjectsContainer}>
          {SUBJECTS.map((subject) => {
            const isMathSubject = ["addition", "subtraction", "multiplication", "division"].includes(subject.topic);
            const isWordProblems = subject.topic === "word_problems";
            const operationStatus = isMathSubject ? operationStatuses[subject.topic as Operation] : null;
            const statusText = isWordProblems ? wordProblemsStatus?.childHomeText : operationStatus?.childHomeText;

            return (
              <TouchableOpacity
                key={subject.topic}
                style={[styles.subjectTile, !subject.isActive && styles.subjectTileInactive]}
                onPress={() => subject.isActive && handleSubjectTap(subject.topic)}
                disabled={!subject.isActive}
              >
                <Text style={styles.subjectLabel}>{subject.label}</Text>
                <Text style={styles.subjectDescription}>{subject.description}</Text>
                {statusText && (
                  <Text style={styles.statusText}>{statusText}</Text>
                )}
                {!subject.isActive && <Text style={styles.comingSoonLabel}>Coming soon</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <SafeAreaView style={styles.settingsModalContainer}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Settings</Text>
            <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.settingsContent}>
            {/* Avatar Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Pick Your Avatar</Text>
              <View style={styles.avatarGrid}>
                {AVATAR_OPTIONS.map((avatar) => (
                  <TouchableOpacity
                    key={avatar}
                    style={[
                      styles.avatarOption,
                      child?.selected_avatar === avatar && styles.avatarOptionSelected,
                    ]}
                    onPress={() => handleAvatarSelect(avatar)}
                  >
                    <Text style={styles.avatarOptionEmoji}>
                      {AVATAR_EMOJI[avatar] || AVATAR_EMOJI.fox}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Background Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Pick Your Background</Text>
              <View style={styles.backgroundGrid}>
                {BACKGROUND_OPTIONS.map((bg) => (
                  <TouchableOpacity
                    key={bg.id}
                    style={[
                      styles.backgroundOption,
                      bg.color ? { backgroundColor: bg.color } : {},
                      child?.home_background === bg.id && styles.backgroundOptionSelected,
                    ]}
                    onPress={() => handleBackgroundSelect(bg.id)}
                  >
                    {bg.id === "giraffe" ? (
                      <View style={styles.giraffePreview} />
                    ) : null}
                    <Text style={styles.backgroundLabel}>{bg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  solidBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
    backgroundColor: "transparent",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  leftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  allDoneButton: {
    paddingVertical: 4,
  },
  allDoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
  },
  topRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shopButton: {
    paddingHorizontal: 4,
  },
  shopIcon: {
    fontSize: 20,
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
  },
  starsText: {
    fontSize: 16,
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
  completedHomeworkSection: {
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
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
  completedHomeworkCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c8e6c9",
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
  completedCheck: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4caf50",
    marginLeft: 12,
  },
  episodesSection: {
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  episodesSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  episodeCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c8e6c9",
  },
  episodeInfo: {
    flex: 1,
    gap: 8,
  },
  episodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  episodeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#4caf50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  episodeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  settingsModalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  settingsContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  settingsSection: {
    marginBottom: 32,
  },
  settingsSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  avatarOption: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  avatarOptionSelected: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  avatarOptionEmoji: {
    fontSize: 48,
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  backgroundOption: {
    width: "48%",
    height: 100,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
    backgroundColor: "#f5f5f5",
  },
  backgroundOptionSelected: {
    borderColor: "#2196f3",
  },
  backgroundLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 8,
  },
  giraffePreview: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: "#FBF3E1",
  },
});
