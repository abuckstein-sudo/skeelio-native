import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

type MaterialRow = {
  id: string;
  material_type: "image" | "text" | "document";
  title: string | null;
  created_at: string;
  school_homework_items?: {
    task_text?: string | null;
    task_kind?: string | null;
  } | null;
  school_homework_days?: {
    homework_date?: string | null;
    source_type?: string | null;
  } | null;
};

const CATEGORIES = [
  { id: "agenda", title: "Agenda images", icon: "calendar-text-outline" },
  { id: "worksheets", title: "Worksheets / learning materials", icon: "file-document-outline" },
  { id: "quizzes", title: "Quizzes / tests", icon: "clipboard-check-outline" },
] as const;

function categoryFor(material: MaterialRow): typeof CATEGORIES[number]["id"] {
  const kind = material.school_homework_items?.task_kind || "";
  const title = `${material.title || ""} ${material.school_homework_items?.task_text || ""}`.toLowerCase();
  if (kind === "signature" || /quiz|test|interro|controle|contrôle|evaluation|évaluation/.test(title)) return "quizzes";
  if (material.school_homework_days?.source_type === "photo" && material.material_type === "image") return "agenda";
  return "worksheets";
}

export default function ChildDocumentsSection({ childId }: { childId: string }) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMaterials = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("school_homework_materials")
        .select("id, material_type, title, created_at, school_homework_items(task_text, task_kind), school_homework_days(homework_date, source_type)")
        .eq("child_id", childId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMaterials((data || []) as unknown as MaterialRow[]);
    } catch (err) {
      console.error("[documents] fetch error:", err);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    void fetchMaterials();
  }, [fetchMaterials]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Photos/documents</Text>
      <Text style={styles.note}>
        Saved materials for this child. New uploads should be filed as agenda images, worksheets/learning materials, or quizzes/tests.
      </Text>
      {loading ? <ActivityIndicator size="small" color="#1565c0" /> : null}
      {CATEGORIES.map((category) => {
        const grouped = materials.filter((material) => categoryFor(material) === category.id);
        return (
          <View key={category.id} style={styles.categoryBlock}>
            <View style={styles.categoryHeader}>
              <MaterialCommunityIcons name={category.icon} size={18} color="#1565c0" />
              <Text style={styles.categoryTitle}>{category.title}</Text>
              <Text style={styles.count}>{grouped.length}</Text>
            </View>
            {grouped.length === 0 ? (
              <Text style={styles.empty}>Nothing saved here yet.</Text>
            ) : (
              grouped.slice(0, 8).map((material) => (
                <TouchableOpacity key={material.id} style={styles.row} activeOpacity={0.7}>
                  <MaterialCommunityIcons
                    name={material.material_type === "image" ? "image-outline" : material.material_type === "document" ? "file-outline" : "text-box-outline"}
                    size={18}
                    color="#64748b"
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {material.title || material.school_homework_items?.task_text || "Saved material"}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {material.school_homework_days?.homework_date || "No date"} · {material.material_type}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
  },
  categoryBlock: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  categoryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
  },
  count: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
  },
  empty: {
    padding: 12,
    fontSize: 13,
    color: "#94a3b8",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1f2937",
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
});
