import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

interface Episode {
  id: string;
  created_at: string;
  completed_at: string | null;
  concept: { label: string; description?: string; sub_skills?: any[] } | null;
  domain: string;
  mastered: boolean;
  items_attempted: number;
  first_try_correct: number;
  image_path: string | null;
}

interface Attempt {
  sub_skill: string | null;
  question: string;
  expected_answer: string;
  child_answer: string;
  was_correct: boolean;
  created_at: string;
}

export default function ParentProofSection({ childId }: { childId: string }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAttempts, setExpandedAttempts] = useState<Attempt[]>([]);
  const [attemptLoading, setAttemptLoading] = useState(false);

  useEffect(() => {
    if (!childId) return;
    fetchEpisodes();
  }, [childId]);

  const fetchEpisodes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tutor_episodes")
        .select(
          "id, created_at, completed_at, concept, domain, mastered, items_attempted, first_try_correct, image_path"
        )
        .eq("child_id", childId)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("[proof] fetch error:", error);
        setEpisodes([]);
      } else {
        setEpisodes((data || []) as Episode[]);
      }
    } catch (err) {
      console.error("[proof] fetch error:", err);
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (episode: Episode) => {
    if (expandedId === episode.id) {
      setExpandedId(null);
      setExpandedAttempts([]);
      return;
    }

    try {
      setAttemptLoading(true);
      const { data, error } = await supabase
        .from("episode_attempts")
        .select("sub_skill, question, expected_answer, child_answer, was_correct, created_at")
        .eq("episode_id", episode.id)
        .order("created_at");

      if (error) {
        console.error("[proof] attempts fetch error:", error);
        Alert.alert("Error", "Failed to load attempt details");
      } else {
        setExpandedAttempts((data || []) as Attempt[]);
        setExpandedId(episode.id);
      }
    } catch (err) {
      console.error("[proof] attempts error:", err);
      Alert.alert("Error", "Failed to load attempt details");
    } finally {
      setAttemptLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Learning Progress</Text>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  if (episodes.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Learning Progress</Text>
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-document-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>
            No practice sessions yet — scan a worksheet to get started.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Learning Progress</Text>

      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item: episode }) => (
          <View key={episode.id}>
            {/* Episode Card */}
            <TouchableOpacity
              style={styles.card}
              onPress={() => toggleExpand(episode)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                {/* Thumbnail (if available) */}
                {episode.image_path && (
                  <EpisodeThumbnail imagePath={episode.image_path} />
                )}

                <View style={styles.cardContent}>
                  {/* Concept label + domain badge */}
                  <View style={styles.conceptRow}>
                    <Text style={styles.concept} numberOfLines={1}>
                      {episode.concept?.label || "Unknown"}
                    </Text>
                    <View
                      style={[
                        styles.domainBadge,
                        {
                          backgroundColor:
                            episode.domain === "language" ? "#9c27b0" : "#4caf50",
                        },
                      ]}
                    >
                      <Text style={styles.domainText}>
                        {episode.domain === "language" ? "Langue" : "Maths"}
                      </Text>
                    </View>
                  </View>

                  {/* Outcome badge */}
                  <View
                    style={[
                      styles.outcomeBadge,
                      {
                        backgroundColor: episode.mastered ? "#4caf50" : "#ff9800",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={episode.mastered ? "check-circle" : "alert-circle"}
                      size={14}
                      color="#fff"
                    />
                    <Text style={styles.outcomeText}>
                      {episode.mastered ? "Mastered ✓" : "Needs practice"}
                    </Text>
                  </View>

                  {/* First-try correctness */}
                  <Text style={styles.scoreText}>
                    {episode.first_try_correct} of {episode.items_attempted} correct on the
                    first try
                  </Text>

                  {/* Date */}
                  <Text style={styles.dateText}>
                    {formatDate(episode.completed_at || episode.created_at)}
                  </Text>
                </View>

                {/* Expand indicator */}
                <MaterialCommunityIcons
                  name={expandedId === episode.id ? "chevron-up" : "chevron-down"}
                  size={24}
                  color="#999"
                />
              </View>
            </TouchableOpacity>

            {/* Expanded Attempts */}
            {expandedId === episode.id && (
              <View style={styles.expandedContent}>
                {attemptLoading ? (
                  <ActivityIndicator size="small" color="#2196f3" />
                ) : expandedAttempts.length === 0 ? (
                  <Text style={styles.noAttemptsText}>No attempts recorded</Text>
                ) : (
                  <FlatList
                    data={expandedAttempts}
                    keyExtractor={(_, idx) => String(idx)}
                    scrollEnabled={false}
                    renderItem={({ item: attempt, index }) => (
                      <View style={styles.attemptRow} key={index}>
                        {/* Question */}
                        <Text style={styles.attemptQuestion}>{attempt.question}</Text>

                        {/* Child's answer + correctness */}
                        <View style={styles.answerRow}>
                          <Text style={styles.answerLabel}>Child answered:</Text>
                          <View style={styles.answerContent}>
                            <Text style={styles.answerText}>{attempt.child_answer}</Text>
                            <MaterialCommunityIcons
                              name={attempt.was_correct ? "check-circle" : "close-circle"}
                              size={18}
                              color={attempt.was_correct ? "#4caf50" : "#f44336"}
                            />
                          </View>
                        </View>

                        {/* Expected answer (if wrong) */}
                        {!attempt.was_correct && (
                          <View style={styles.answerRow}>
                            <Text style={styles.answerLabel}>Expected:</Text>
                            <Text style={styles.expectedAnswer}>
                              {attempt.expected_answer}
                            </Text>
                          </View>
                        )}

                        {/* Sub-skill tag */}
                        {attempt.sub_skill && (
                          <View style={styles.subSkillTag}>
                            <Text style={styles.subSkillText}>{attempt.sub_skill}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  />
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function EpisodeThumbnail({ imagePath }: { imagePath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("worksheets")
          .createSignedUrl(imagePath, 3600);

        if (error) {
          console.error("[proof] signed url error:", error);
          setSignedUrl(null);
        } else {
          setSignedUrl(data?.signedUrl || null);
        }
      } catch (err) {
        console.error("[proof] signed url error:", err);
        setSignedUrl(null);
      } finally {
        setLoadingUrl(false);
      }
    };

    fetchSignedUrl();
  }, [imagePath]);

  if (loadingUrl) {
    return <View style={styles.thumbnail} />;
  }

  if (!signedUrl) {
    return (
      <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
        <MaterialCommunityIcons name="image-off" size={20} color="#ccc" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: signedUrl }}
      style={styles.thumbnail}
      defaultSource={require("@expo/vector-icons").MaterialCommunityIcons}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    marginTop: 12,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: "#e8e8e8",
  },
  thumbnailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
    gap: 6,
  },
  conceptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  concept: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  domainBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  domainText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  outcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  outcomeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  scoreText: {
    fontSize: 13,
    color: "#666",
  },
  dateText: {
    fontSize: 11,
    color: "#999",
  },
  expandedContent: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  attemptRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    marginBottom: 10,
    gap: 8,
  },
  attemptQuestion: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  answerRow: {
    gap: 8,
  },
  answerLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
  },
  answerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderRadius: 4,
  },
  answerText: {
    flex: 1,
    fontSize: 13,
    color: "#333",
    fontStyle: "italic",
  },
  expectedAnswer: {
    fontSize: 13,
    color: "#f44336",
    fontWeight: "500",
  },
  subSkillTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#e3f2fd",
    borderRadius: 4,
    marginTop: 4,
  },
  subSkillText: {
    fontSize: 11,
    color: "#1976d2",
    fontWeight: "500",
  },
  noAttemptsText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
  },
});
