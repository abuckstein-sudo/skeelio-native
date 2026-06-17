import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  addSchoolHomeworkImageMaterial,
  addSchoolHomeworkTextMaterial,
  itemNeedsMaterial,
  listSchoolHomeworkDay,
  replaceSchoolHomeworkDay,
  schoolHomeworkDateLabel,
  schoolHomeworkShortDateLabel,
  schoolHomeworkWeekDateKeys,
  SchoolHomeworkDay,
  SchoolHomeworkItem,
  setSchoolHomeworkItemDone,
  todayDateKey,
} from "@/lib/schoolHomework";
import { getChildHomeworkLimit, setChildHomeworkLimit, unlockChildHomeworkForToday } from "@/lib/homeworkTime";

export default function SchoolHomeworkManager({ childId }: { childId: string }) {
  const [homeworkDay, setHomeworkDay] = useState<SchoolHomeworkDay | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materialTextByItem, setMaterialTextByItem] = useState<Record<string, string>>({});
  const [materialSavingItemId, setMaterialSavingItemId] = useState<string | null>(null);
  const [editingMaterialItemIds, setEditingMaterialItemIds] = useState<Record<string, boolean>>({});
  const [limitInput, setLimitInput] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const weekDateKeys = schoolHomeworkWeekDateKeys(weekAnchor);
  const [homeworkDate, setHomeworkDate] = useState(todayDateKey());

  useEffect(() => {
    void fetchHomework();
  }, [childId, homeworkDate]);

  const fetchHomework = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const day = await listSchoolHomeworkDay(childId, homeworkDate);
      const limit = await getChildHomeworkLimit(childId);
      setHomeworkDay(day);
      setRawInput(day?.raw_input || "");
      setLimitInput(limit?.daily_limit_minutes ? String(limit.daily_limit_minutes) : "");
      setEditingMaterialItemIds({});
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
      Alert.alert("Saved", "School homework is ready on the child home screen.");
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo library access to attach a homework photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled) return;

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1100 } }],
        { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) throw new Error("Could not read selected image");

      const materialResult = await addSchoolHomeworkImageMaterial({
        item,
        dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
        imageBase64: manipulated.base64,
      });
      setEditingMaterialItemIds((current) => ({ ...current, [item.id]: false }));
      await fetchHomework();
      Alert.alert(
        materialResult.createdSpellingPractice ? "Spelling practice ready" : "Photo saved",
        materialResult.createdSpellingPractice
          ? "The child can now practice this spelling list."
          : "The child can now open this homework material."
      );
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
      setEditingMaterialItemIds((current) => ({ ...current, [item.id]: false }));
      await fetchHomework();
    } catch (err) {
      console.error("[school-homework-manager] add text material error:", err);
      Alert.alert("Error", "Could not save the text.");
    } finally {
      setMaterialSavingItemId(null);
    }
  };

  const handleStartMaterialEdit = (item: SchoolHomeworkItem) => {
    const material = (item.school_homework_materials || [])[0];
    setMaterialTextByItem((current) => ({
      ...current,
      [item.id]: material?.material_type === "text" ? material.text_content || "" : "",
    }));
    setEditingMaterialItemIds((current) => ({ ...current, [item.id]: true }));
  };

  const handleSaveLimit = async () => {
    const minutes = limitInput.trim() ? Number(limitInput.trim()) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1)) {
      Alert.alert("Invalid limit", "Use a whole number of minutes, or leave it blank.");
      return;
    }

    try {
      setSavingLimit(true);
      await setChildHomeworkLimit(childId, minutes);
      Alert.alert("Saved", minutes ? `Daily homework limit set to ${minutes} minutes.` : "Daily homework limit removed.");
    } catch (err) {
      console.error("[school-homework-manager] save limit error:", err);
      Alert.alert("Error", "Could not save the time limit.");
    } finally {
      setSavingLimit(false);
    }
  };

  const handleUnlockToday = async () => {
    try {
      await unlockChildHomeworkForToday(childId);
      Alert.alert("Unlocked", "This child can continue homework today.");
    } catch (err) {
      console.error("[school-homework-manager] unlock error:", err);
      Alert.alert("Error", "Could not unlock homework time.");
    }
  };

  const shiftWeek = (direction: -1 | 1) => {
    const next = new Date(weekAnchor);
    next.setDate(next.getDate() + direction * 7);
    const nextWeek = schoolHomeworkWeekDateKeys(next);
    setWeekAnchor(next);
    setHomeworkDate(nextWeek[0]);
  };

  const items = homeworkDay?.school_homework_items || [];
  const setupItems = items.filter((item) => itemNeedsMaterial(item) || item.status === "waiting_parent");
  const doneCount = items.filter((item) => item.status === "done").length;
  const totalMinutes = Math.round((homeworkDay?.total_active_seconds || 0) / 60);
  const waitingCount = items.filter((item) => item.status === "waiting_parent").length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>School homework</Text>
          <Text style={styles.dateText}>{schoolHomeworkDateLabel(homeworkDate)}</Text>
        </View>
        {loading ? <ActivityIndicator size="small" color="#2196f3" /> : null}
      </View>

      <View style={styles.daySelector}>
        <TouchableOpacity style={styles.weekButton} onPress={() => shiftWeek(-1)}>
          <MaterialCommunityIcons name="chevron-left" size={18} color="#455a64" />
        </TouchableOpacity>
        {weekDateKeys.map((dateKey) => {
          const selected = dateKey === homeworkDate;
          return (
            <TouchableOpacity
              key={dateKey}
              style={[styles.dayPill, selected && styles.dayPillSelected]}
              onPress={() => setHomeworkDate(dateKey)}
            >
              <Text style={[styles.dayPillText, selected && styles.dayPillTextSelected]}>
                {schoolHomeworkShortDateLabel(dateKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.weekButton} onPress={() => shiftWeek(1)}>
          <MaterialCommunityIcons name="chevron-right" size={18} color="#455a64" />
        </TouchableOpacity>
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

      <View style={styles.limitPanel}>
        <Text style={styles.limitTitle}>Daily homework limit</Text>
        <View style={styles.limitRow}>
          <TextInput
            style={styles.limitInput}
            value={limitInput}
            onChangeText={setLimitInput}
            keyboardType="number-pad"
            placeholder="Minutes"
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.limitButton} onPress={handleSaveLimit} disabled={savingLimit}>
            <Text style={styles.limitButtonText}>{savingLimit ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.unlockButton} onPress={handleUnlockToday}>
            <Text style={styles.unlockButtonText}>Unlock today</Text>
          </TouchableOpacity>
        </View>
      </View>

      {items.length > 0 && (
        <View style={styles.previewList}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Homework summary</Text>
            <Text style={styles.summaryText}>
              {doneCount}/{items.length} complete
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
              {waitingCount > 0 ? ` · ${waitingCount} waiting for adult` : ""}
            </Text>
          </View>
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
                {(() => {
                  const materialReady = (item.school_homework_materials || []).length > 0;
                  const needsSetup = itemNeedsMaterial(item);
                  const editingMaterial = Boolean(editingMaterialItemIds[item.id]) || needsSetup;
                  return (
                    <>
                <Text style={styles.previewText}>{item.task_text}</Text>
                <View style={styles.previewMetaRow}>
                  <Text style={styles.previewMeta}>
                    {item.linked_assignment_id || item.linked_spelling_list_id
                      ? `${item.task_kind} · linked practice`
                      : materialReady
                        ? `${item.task_kind} · material ready`
                        : needsSetup
                          ? `${item.task_kind} · needs material`
                          : item.status === "waiting_parent"
                            ? "waiting for parent"
                            : item.task_kind}
                  </Text>
                  {(materialReady || item.task_kind === "reading" || item.task_kind === "signature") && !editingMaterial && (
                    <TouchableOpacity
                      style={styles.editMaterialButton}
                      onPress={() => handleStartMaterialEdit(item)}
                    >
                      <Text style={styles.editMaterialText}>{materialReady ? "Edit" : "Add"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!editingMaterial &&
                  (item.school_homework_materials || [])[0]?.material_type === "image" &&
                  (item.school_homework_materials || [])[0]?.text_content?.startsWith("data:image/") && (
                    <Image
                      source={{ uri: (item.school_homework_materials || [])[0].text_content || "" }}
                      style={styles.materialPreviewImage}
                      resizeMode="cover"
                    />
                  )}
                {editingMaterial && (
                  <View style={styles.materialPanel}>
                    {materialReady && (
                      <Text style={styles.materialReadyText}>
                        Replacing this will keep the homework item and child progress, but update the attached material.
                      </Text>
                    )}
                    {(item.school_homework_materials || [])[0]?.material_type === "image" &&
                      (item.school_homework_materials || [])[0]?.text_content?.startsWith("data:image/") && (
                        <Image
                          source={{ uri: (item.school_homework_materials || [])[0].text_content || "" }}
                          style={styles.materialPreviewImage}
                          resizeMode="cover"
                        />
                      )}
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
                    {materialReady && (
                      <TouchableOpacity
                        style={styles.cancelEditButton}
                        onPress={() => setEditingMaterialItemIds((current) => ({ ...current, [item.id]: false }))}
                      >
                        <Text style={styles.cancelEditText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                    </>
                  );
                })()}
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
  daySelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  weekButton: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#eceff1",
  },
  dayPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  dayPillSelected: {
    backgroundColor: "#e3f2fd",
    borderColor: "#90caf9",
  },
  dayPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#607d8b",
    textTransform: "capitalize",
  },
  dayPillTextSelected: {
    color: "#1565c0",
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
  limitPanel: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e0e7ef",
  },
  limitTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#455a64",
    marginBottom: 8,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  limitInput: {
    width: 78,
    borderWidth: 1,
    borderColor: "#d7e2ec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#263238",
    backgroundColor: "#fff",
  },
  limitButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#2196f3",
  },
  limitButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  unlockButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#eceff1",
  },
  unlockButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#455a64",
  },
  previewList: {
    marginTop: 14,
    gap: 8,
  },
  summaryBox: {
    backgroundColor: "#eef7ee",
    borderColor: "#c8e6c9",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2e7d32",
  },
  summaryText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#2e7d32",
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
  previewMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  editMaterialButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#eceff1",
  },
  editMaterialText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#455a64",
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
  materialPreviewImage: {
    width: 120,
    height: 86,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: "#e0e0e0",
  },
  materialReadyText: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: "#607d8b",
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
  cancelEditButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#607d8b",
  },
});
