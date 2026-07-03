import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { signedSchoolHomeworkImageUrl } from "@/lib/schoolHomework";

type MaterialRow = {
  id: string;
  material_type: "image" | "text" | "document";
  category?: "agenda" | "worksheet" | "quiz" | null;
  title: string | null;
  created_at: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  text_content?: string | null;
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
  if (material.category === "agenda") return "agenda";
  if (material.category === "quiz") return "quizzes";
  if (material.category === "worksheet") return "worksheets";
  const kind = material.school_homework_items?.task_kind || "";
  const title = `${material.title || ""} ${material.school_homework_items?.task_text || ""}`.toLowerCase();
  if (kind === "signature" || /quiz|test|interro|controle|contrôle|evaluation|évaluation/.test(title)) return "quizzes";
  if (material.school_homework_days?.source_type === "photo" && material.material_type === "image") return "agenda";
  return "worksheets";
}

export default function ChildDocumentsSection({ childId }: { childId: string }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("school_homework_materials")
        .select("id, material_type, title, category, created_at, storage_bucket, storage_path, text_content, school_homework_items(task_text, task_kind), school_homework_days(homework_date, source_type)")
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

  const openImageForReassignment = useCallback(async (material: MaterialRow) => {
    if (material.material_type !== "image" || openingId) return;

    setOpeningId(material.id);
    try {
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("Cache directory is unavailable");

      const signedUrl = await signedSchoolHomeworkImageUrl(material as any);
      if (!signedUrl) throw new Error("Could not open this image");

      const extension = material.storage_path?.split(".").pop()?.split("?")[0] || "jpg";
      const localUri = `${cacheDirectory}document-reassign-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

      let imageUri = localUri;
      if (signedUrl.startsWith("data:image/")) {
        const base64 = signedUrl.split(",")[1] || "";
        await FileSystem.writeAsStringAsync(localUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const downloaded = await FileSystem.downloadAsync(signedUrl, localUri);
        imageUri = downloaded.uri;
      }

      router.push({
        pathname: "/(app)/scan",
        params: {
          childId,
          imageUri,
          source: "documents",
        },
      });
    } catch (err) {
      console.error("[documents] reassign image error:", err);
      Alert.alert("Error", "Could not open this image for reassignment.");
    } finally {
      setOpeningId(null);
    }
  }, [childId, openingId, router]);

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
                <TouchableOpacity
                  key={material.id}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={material.material_type === "image" ? () => openImageForReassignment(material) : undefined}
                  disabled={material.material_type !== "image" || openingId === material.id}
                >
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
                  {openingId === material.id ? (
                    <ActivityIndicator size="small" color="#1565c0" />
                  ) : material.material_type === "image" ? (
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#94a3b8" />
                  ) : null}
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
