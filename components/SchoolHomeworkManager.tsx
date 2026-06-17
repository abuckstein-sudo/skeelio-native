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
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import {
  addSchoolHomeworkImageMaterial,
  addSchoolHomeworkTextMaterial,
  itemNeedsMaterial,
  listSchoolHomeworkDay,
  replaceSchoolHomeworkDay,
  schoolHomeworkDateLabel,
  SchoolHomeworkDay,
  SchoolHomeworkItem,
  setSchoolHomeworkItemDone,
  todayDateKey,
} from "@/lib/schoolHomework";
import { supabase } from "@/lib/supabase";

export default function SchoolHomeworkManager({ childId }: { childId: string }) {
  const [homeworkDay, setHomeworkDay] = useState<SchoolHomeworkDay | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materialTextByItem, setMaterialTextByItem] = useState<Record<string, string>>({});
  const [materialSavingItemId, setMaterialSavingItemId] = useState<string | null>(null);
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

  const handleToggleItem = async (item: SchoolHomeworkItem) => {
    try {
      await setSchoolHomeworkItemDone(item, item.status !== "done", "adult");
      await fetchHomework();
    } catch (err) {
      console.error("[school-homework-manager] toggle error:", err);
      Alert.alert("Error", "Could not update homework item.");
    }
  };

  const handleAttachPhoto = async (item: SchoolHomeworkItem) => {
    try {
      setMaterialSavingItemId(item.id);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) return;

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1500 } }],
        { compress: 0.62, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) throw new Error("Could not read selected image");

      const path = `homework/${item.parent_id}/${item.child_id}/${item.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("worksheets")
        .upload(path, decode(manipulated.base64), { contentType: "image/jpeg", upsert: false });

      if (uploadError) throw uploadError;

      await addSchoolHomeworkImageMaterial({ item, storagePath: path });
      await fetchHomework();
    } catch (err) {
      console.error("[school-homework-manager] attach photo error:", err);
      Alert.alert("Error", "Could not attach the photo.");
    } finally {
      setMaterialSavingItemId(null);
    }
  };

  const handleAddText = async (item: SchoolHomeworkItem) => {
    const textContent = (materialTextByItem[item.id] || "").trim();
    if (!textContent) {
      Alert.alert("Text is empty", "Type the reading page, spelling list, or note first.");
      return;
    }

    try {
      setMaterialSavingItemId(item.id);
      await addSchoolHomeworkTextMaterial({ item, textContent });
      setMaterialTextByItem((current) => ({ ...current, [item.id]: "" }));
      await fetchHomework();
    } catch (err) {
      console.error("[school-homework-manager] add text material error:", err);
      Alert.alert("Error", "Could not save the text.");
    } finally {
      setMaterialSavingItemId(null);
    }
  };

  const items = homeworkDay?.school_homework_items || [];
  const setupItems = items.filter((item) => itemNeedsMaterial(item) || item.status === "waiting_parent");

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
          {setupItems.length > 0 && (
            <View style={styles.setupBox}>
              <Text style={styles.setupTitle}>Needs info</Text>
              <Text style={styles.setupBody}>
                Add the missing school material so the child can open the homework item directly.
              </Text>
            </View>
          )}
          {items.map((item) => (
            <View style={styles.previewItem} key={item.id}>
              <TouchableOpacity
                style={styles.previewCheck}
                onPress={() => void handleToggleItem(item)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={item.status === "done" ? "check-circle" : "checkbox-blank-circle-outline"}
                  size={18}
                  color={item.status === "done" ? "#4caf50" : "#90a4ae"}
                />
              </TouchableOpacity>
              <View style={styles.previewTextWrap}>
                <Text style={styles.previewText}>{item.task_text}</Text>
                <Text style={styles.previewMeta}>
                  {item.linked_assignment_id || item.linked_spelling_list_id
                    ? `${item.task_kind} · linked practice`
                    : (item.school_homework_materials || []).length > 0
                      ? `${item.task_kind} · material ready`
                      : itemNeedsMaterial(item)
                        ? `${item.task_kind} · needs material`
                        : item.status === "waiting_parent"
                          ? "waiting for parent"
                          : item.task_kind}
                </Text>
                {(itemNeedsMaterial(item) || item.task_kind === "reading" || item.task_kind === "signature") && (
                  <View style={styles.materialPanel}>
                    <View style={styles.materialActions}>
                      <TouchableOpacity
                        style={styles.materialButton}
                        onPress={() => void handleAttachPhoto(item)}
                        disabled={materialSavingItemId === item.id}
                      >
                        <MaterialCommunityIcons name="image-plus" size={16} color="#1565c0" />
                        <Text style={styles.materialButtonText}>Photo</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.materialInput}
                      value={materialTextByItem[item.id] || ""}
                      onChangeText={(text) => setMaterialTextByItem((current) => ({ ...current, [item.id]: text }))}
                      placeholder="Or paste the page/list text here"
                      placeholderTextColor="#999"
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={styles.textSaveButton}
                      onPress={() => void handleAddText(item)}
                      disabled={materialSavingItemId === item.id}
                    >
                      <Text style={styles.textSaveButtonText}>
                        {materialSavingItemId === item.id ? "Saving..." : "Save text"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
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
  previewCheck: {
    paddingTop: 1,
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
  setupBox: {
    backgroundColor: "#fff8e1",
    borderColor: "#ffe0b2",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  setupTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#795548",
  },
  setupBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#795548",
  },
  materialPanel: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#d7e9fb",
  },
  materialActions: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  materialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
  },
  materialButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1565c0",
  },
  materialInput: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: "#d7e9fb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#333",
    backgroundColor: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
  textSaveButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#2196f3",
  },
  textSaveButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
