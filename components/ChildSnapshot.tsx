import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { buildChildAssessment, ChildAssessment } from "@/lib/childAssessment";

const SUBJECT_TO_AREA: Record<string, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
  spelling: "Spelling",
  conjugation: "Conjugation",
};

const SUBJECT_LABEL: Record<string, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
  spelling: "Spelling",
  conjugation: "Conjugation",
  reading: "Reading",
};

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  ready_to_level_up: "Ready to level up",
  needs_work: "Could use practice",
  not_enough_data: "Not enough data yet",
};

const STATUS_COLOR: Record<string, string> = {
  on_track: "#4caf50",
  ready_to_level_up: "#2196f3",
  needs_work: "#ff9800",
  not_enough_data: "#bdbdbd",
};

interface ChildSnapshotProps {
  childId: string;
  childName: string;
  grade: string;
  avatar: string;
}

export default function ChildSnapshot({
  childId,
  childName,
  grade,
}: ChildSnapshotProps) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [stars, setStars] = useState(0);
  const [expandedCard, setExpandedCard] = useState<"status" | null>(null);
  const [focusSubjects, setFocusSubjects] = useState<string[]>([]);

  const [assessment, setAssessment] = useState<ChildAssessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchAssessment();
  }, [childId]);

  const fetchData = async () => {
    try {
      // Fetch pending episodes count
      const { count: pendingCount } = await supabase
        .from("tutor_episodes")
        .select("id", { count: "exact", head: true })
        .eq("child_id", childId)
        .eq("status", "pending");

      setPendingCount(pendingCount || 0);

      // Fetch stars
      const { data: rewardsData } = await supabase
        .from("rewards")
        .select("stars")
        .eq("child_id", childId)
        .maybeSingle();

      setStars(rewardsData?.stars ?? 0);

      const { data: childRow } = await supabase
        .from("children")
        .select("focus_subjects")
        .eq("id", childId)
        .single();
      setFocusSubjects(
        Array.isArray(childRow?.focus_subjects) ? childRow.focus_subjects : []
      );

    } catch (err) {
      console.error("[snapshot] fetch error:", err);
    }
  };

  const fetchAssessment = async () => {
    setAssessmentLoading(true);
    try {
      const result = await buildChildAssessment(childId);
      console.log("[assessment]", JSON.stringify(result, null, 2));
      setAssessment(result);
    } catch (err) {
      console.error("[snapshot] assessment error:", err);
      setAssessment(null);
    } finally {
      setAssessmentLoading(false);
    }
  };

  const getAssessmentSummary = (): { onTrack: string[]; needsWork: string[]; notEnough: string[]; readyToLevelUp: string[] } => {
    if (!assessment) return { onTrack: [], needsWork: [], notEnough: [], readyToLevelUp: [] };

    const onTrack = assessment.areas
      .filter((a) => a.status === "on_track")
      .map((a) => a.area);
    const needsWork = assessment.areas
      .filter((a) => a.status === "needs_work")
      .map((a) => a.area);
    const notEnough = assessment.areas
      .filter((a) => a.status === "not_enough_data")
      .map((a) => a.area);

    const readyToLevelUp = assessment.areas
      .filter((a) => a.status === "ready_to_level_up")
      .map((a) => a.area);

    return { onTrack, needsWork, notEnough, readyToLevelUp };
  };

  return (
    <View style={styles.container}>
      {/* Card 1: Where childName is at */}
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          setExpandedCard(expandedCard === "status" ? null : "status")
        }
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Text style={styles.cardTitle}>
              Where {childName} is at
            </Text>
            <Text style={styles.cardCollapsed}>
              {pendingCount > 0
                ? `${pendingCount} practice to do`
                : "All caught up ✓"}
              {" • "}⭐ {stars}
            </Text>
            {assessmentLoading ? (
              <ActivityIndicator size="small" color="#2196f3" style={styles.insightLoader} />
            ) : assessment ? (
              (() => {
                const { onTrack, needsWork, notEnough, readyToLevelUp } = getAssessmentSummary();
                const parts = [];
                if (onTrack.length > 0) {
                  parts.push(`On track for his age: ${onTrack.join(", ")}`);
                }
                if (readyToLevelUp.length > 0) {
                  parts.push(`Ready to level up: ${readyToLevelUp.join(", ")}`);
                }
                if (needsWork.length > 0) {
                  parts.push(`Could use some practice: ${needsWork.join(", ")}`);
                }
                if (notEnough.length > 0) {
                  parts.push(`Not enough data yet to assess: ${notEnough.join(", ")}`);
                }
                const summary = parts.filter((p) => p).join(". ");
                return summary ? (
                  <Text style={styles.assessmentText}>{summary}</Text>
                ) : null;
              })()
            ) : null}
          </View>
          <MaterialCommunityIcons
            name={expandedCard === "status" ? "chevron-up" : "chevron-down"}
            size={24}
            color="#999"
          />
        </View>

        {expandedCard === "status" && (
          <View style={styles.cardExpanded}>
            {focusSubjects.length > 0 ? (
              focusSubjects.map((key) => {
                const areaName = SUBJECT_TO_AREA[key];
                const area = areaName
                  ? (assessment?.areas || []).find((a) => a.area === areaName)
                  : undefined;
                const status = area?.status ?? "not_enough_data";
                const evidence = area?.evidence ?? "Not started yet";
                const color = STATUS_COLOR[status] || "#bdbdbd";
                return (
                  <View key={key} style={[styles.tile, { borderLeftColor: color }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tileTitle}>{SUBJECT_LABEL[key] || key}</Text>
                      <Text style={styles.tileEvidence}>{evidence}</Text>
                    </View>
                    <Text style={[styles.tileStatus, { color }]}>
                      {STATUS_LABEL[status]}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.expandedText}>
                No subjects selected. Use the gear by {childName} to choose some.
              </Text>
            )}

            <TouchableOpacity
              style={styles.pastWorkLink}
              onPress={() =>
                router.push({
                  pathname: "/(app)/past-work",
                  params: { childId, childName },
                })
              }
            >
              <Text style={styles.pastWorkLinkText}>View past work →</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#f9f9f9",
    gap: 12,
  },
  cardHeaderContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  cardCollapsed: {
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
  },
  insightLoader: {
    marginTop: 4,
  },
  insightText: {
    fontSize: 12,
    color: "#555",
    lineHeight: 18,
    marginTop: 4,
    fontStyle: "italic",
  },
  assessmentText: {
    fontSize: 12,
    color: "#555",
    lineHeight: 18,
    marginTop: 4,
  },
  activeAreasList: {
    gap: 10,
  },
  activeAreaItem: {
    borderLeftWidth: 3,
    borderLeftColor: "#2196f3",
    paddingLeft: 10,
  },
  activeAreaLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  activeAreaEvidence: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  cardExpanded: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  expandedText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  tipsList: {
    gap: 10,
  },
  tipItem: {
    flexDirection: "row",
    gap: 8,
  },
  tipBullet: {
    fontSize: 14,
    color: "#2196f3",
    fontWeight: "600",
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  toggleButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    alignItems: "center",
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2196f3",
  },
  pastWorkLink: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  pastWorkLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f9f9f9",
    borderLeftWidth: 4,
    borderLeftColor: "#bdbdbd",
    borderRadius: 6,
    marginBottom: 10,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  tileEvidence: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  tileStatus: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 10,
    maxWidth: 110,
    textAlign: "right",
  },
});
