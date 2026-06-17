import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  listSchoolHomeworkDay,
  replaceSchoolHomeworkDay,
  schoolHomeworkDateLabel,
  SchoolHomeworkDay,
  setSchoolHomeworkItemDone,
  todayDateKey,
} from "@/lib/schoolHomework";

export default function SchoolHomeworkManager({ childId }: { childId: string }) {
  const [homeworkDay, setHomeworkDay] = useState<SchoolHomeworkDay | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const homeworkDate = todayDateKey();

  useEffect(() => {
    void fetchHomework();
  }, [childId]);

  const fetchHomework = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const day = await listSchoolHomeworkDay(childId, homeworkDate);
      setHomeworkDay(day);
      setRawInput(day?.raw_input || "");
    } catch (err) {
      console.error("[school-homework-manager] fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rawInput.trim()) {
      Alert.alert("Homework is empty", "Paste or type the school homework list first.");
      return;
    }

    setSaving(true);
    try {
      const saved = await replaceSchoolHomeworkDay({
        childId,
        homeworkDate,
        rawInput,
        sourceType: "manual",
      });
      setHomeworkDay(saved);
      Alert.alert("Saved", "Today's school homework is ready on the child home screen.");
    } catch (err) {
      console.error("[school-homework-manager] save error:", err);
      Alert.alert("Error", "Could not save school homework.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleItem = async (item: NonNullable<SchoolHomeworkDay["school_homework_items"]>[number]) => {
    try {
      await setSchoolHomeworkItemDone(item, item.status !== "done", "adult");
      await fetchHomework();
    } catch (err) {
      console.error("[school-homework-manager] toggle error:", err);
      Alert.alert("Error", "Could not update homework item.");
    }
  };

  const items = homeworkDay?.school_homework_items || [];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>School homework</Text>
          <Text style={styles.dateText}>{schoolHomeworkDateLabel(homeworkDate)}</Text>
        </View>
        {loading ? <ActivityIndicator size="small" color="#2196f3" /> : null}
      </View>

      <TextInput
        style={styles.input}
        value={rawInput}
        onChangeText={setRawInput}
        placeholder={"Paste today's homework list\nrelire R22 à R24\nPratique Liste 26\nTables multiplication par coeur 1x à 5x"}
        placeholderTextColor="#999"
        multiline
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#fff" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save homework"}</Text>
      </TouchableOpacity>

      {items.length > 0 && (
        <View style={styles.previewList}>
          {items.map((item) => (
            <TouchableOpacity
              style={styles.previewItem}
              key={item.id}
              onPress={() => void handleToggleItem(item)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={item.status === "done" ? "check-circle" : "checkbox-blank-circle-outline"}
                size={18}
                color={item.status === "done" ? "#4caf50" : "#90a4ae"}
              />
              <View style={styles.previewTextWrap}>
                <Text style={styles.previewText}>{item.task_text}</Text>
                <Text style={styles.previewMeta}>{item.task_kind.replace("_", " ")}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  dateText: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  input: {
    minHeight: 126,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#333",
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: "#fafafa",
  },
  saveButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  previewList: {
    marginTop: 14,
    gap: 8,
  },
  previewItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  previewTextWrap: {
    flex: 1,
  },
  previewText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
  },
  previewMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#777",
    textTransform: "capitalize",
  },
});
