import { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { listAssignmentsForChild, Assignment } from "@/lib/assignments";
import { supabase } from "@/lib/supabase";
import {
  assignMoreLikeWorksheetSkill,
  listWorksheetSkillsForChild,
  worksheetSkillLabel,
  worksheetSkillProgressText,
  WorksheetSkill,
} from "@/lib/worksheetSkills";

type PastWorkView = "date" | "subject" | "worksheets";
type Granularity = "day" | "week" | "month" | "year";

const cap = (s?: string | null) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

function timeBucket(
  dateStr: string | null | undefined,
  gran: Granularity
): { key: string; label: string } {
  const d = dateStr ? new Date(dateStr) : new Date(0);
  if (gran === "day") {
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    };
  }
  if (gran === "week") {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return {
      key: monday.toISOString().slice(0, 10),
      label: `Week of ${monday.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
    };
  }
  if (gran === "month") {
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    };
  }
  return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
}

function WorksheetThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!path) return;
      try {
        const { data } = await supabase.storage
          .from("worksheets")
          .createSignedUrl(path, 3600);
        if (active) setUrl(data?.signedUrl || null);
      } catch {
        if (active) setUrl(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) {
    return (
      <View style={[styles.thumb, styles.thumbPlaceholder]}>
        <MaterialCommunityIcons name="file-document-outline" size={22} color="#ccc" />
      </View>
    );
  }
  return <Image source={{ uri: url }} style={styles.thumb} />;
}

export default function PastWorkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId: string; childName?: string }>();
  const id = String(params.childId || "");
  const childName = params.childName ? String(params.childName) : "";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [worksheetSkills, setWorksheetSkills] = useState<WorksheetSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<PastWorkView>("date");
  const [granularity, setGranularity] = useState<Granularity>("month");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const all = await listAssignmentsForChild(id);
      const done = all
        .filter((a) => a.status === "complete")
        .sort((a, b) => {
          const da = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const db = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return db - da;
        });
      setAssignments(done);

      setWorksheetSkills(await listWorksheetSkillsForChild(id));
    } catch (err) {
      console.error("[past-work] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Assignment[] }>();
    for (const a of assignments) {
      let key: string;
      let label: string;
      if (view === "subject") {
        const subj = a.focus || a.subject || "other";
        key = String(subj);
        label = cap(String(subj));
      } else {
        const b = timeBucket(a.completed_at, granularity);
        key = b.key;
        label = b.label;
      }
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(a);
    }
    let arr = Array.from(map.values());
    if (view === "subject") {
      arr = arr.sort((x, y) => x.label.localeCompare(y.label));
    }
    return arr;
  }, [assignments, view, granularity]);

  const assignAgain = async (w: WorksheetSkill) => {
    try {
      await assignMoreLikeWorksheetSkill(w);
      Alert.alert(
        "Assigned",
        `Added more practice for "${worksheetSkillLabel(w)}" to ${
          childName || "the child"
        }'s to-do list.`
      );
    } catch (err) {
      console.error("[past-work] assign-again error:", err);
      Alert.alert("Error", "Couldn't create the assignment.");
    }
  };

  const deleteWorksheet = (w: WorksheetSkill) => {
    Alert.alert(
      "Delete skill work?",
      "This removes it from past worksheet skills. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("tutor_episodes")
                .delete()
                .eq("id", w.id);
              if (error) throw error;
              setWorksheetSkills((prev) => prev.filter((x) => x.id !== w.id));
            } catch (err) {
              console.error("[past-work] delete error:", err);
              Alert.alert("Error", "Couldn't delete this worksheet.");
            }
          },
        },
      ]
    );
  };

  const renderTab = (key: PastWorkView, label: string) => (
    <TouchableOpacity
      style={[styles.tab, view === key && styles.tabActive]}
      onPress={() => setView(key)}
    >
      <Text style={[styles.tabText, view === key && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {childName ? `${childName}'s past work` : "Past work"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow}>
        {renderTab("date", "By date")}
        {renderTab("subject", "By subject")}
        {renderTab("worksheets", "Worksheet skills")}
      </View>

      {view === "date" && (
        <View style={styles.granRow}>
          {(["day", "week", "month", "year"] as Granularity[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.granBtn, granularity === g && styles.granBtnActive]}
              onPress={() => setGranularity(g)}
            >
              <Text style={[styles.granText, granularity === g && styles.granTextActive]}>
                {cap(g)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2196f3" />
        </View>
      ) : view === "worksheets" ? (
        worksheetSkills.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No worksheets scanned yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {worksheetSkills.map((w) => (
              <View key={w.id} style={styles.wsRow}>
                <WorksheetThumb path={w.image_path} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {worksheetSkillLabel(w)}
                  </Text>
                  <Text style={styles.rowDetail}>
                    {w.domain === "language" ? "Language" : "Math"} ·{" "}
                    {new Date(w.created_at).toLocaleDateString()}
                    {" · "}
                    {worksheetSkillProgressText(w)}
                  </Text>
                  <View style={styles.wsActions}>
                    <TouchableOpacity style={styles.wsBtn} onPress={() => assignAgain(w)}>
                      <MaterialCommunityIcons name="refresh" size={14} color="#2196f3" />
                      <Text style={styles.wsBtnText}>Assign more like this</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.wsDeleteBtn}
                      onPress={() => deleteWorksheet(w)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={14} color="#d32f2f" />
                      <Text style={styles.wsDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )
      ) : assignments.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No completed work yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map((a) => (
                <View key={a.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {cap(a.focus) || cap(a.subject) || "Practice"}
                    </Text>
                    <Text style={styles.rowDetail}>
                      {a.question_count} questions · {a.mode === "quiz" ? "Quiz" : "Practice"}
                      {a.completed_at
                        ? ` · ${new Date(a.completed_at).toLocaleDateString()}`
                        : ""}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="check-circle" size={22} color="#4caf50" />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backBtn: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  tabActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },
  tabTextActive: {
    color: "#2196f3",
  },
  granRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  granBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    alignItems: "center",
  },
  granBtnActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  granText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
  },
  granTextActive: {
    color: "#2196f3",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  group: {
    marginBottom: 20,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f0f9f0",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    borderRadius: 6,
    marginBottom: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  rowDetail: {
    fontSize: 12,
    color: "#666",
  },
  wsRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: "#e8e8e8",
  },
  thumbPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  wsActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  wsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  wsBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2196f3",
  },
  wsDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#f0c4c4",
    backgroundColor: "#ffebee",
  },
  wsDeleteText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#d32f2f",
  },
});
