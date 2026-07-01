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
  Share,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import CameraCaptureModal from "./CameraCaptureModal";
import DatePickerModal from "./DatePickerModal";
import {
  addSchoolHomeworkDocumentMaterial,
  addSchoolHomeworkImageMaterial,
  addSchoolHomeworkTextMaterial,
  extractSchoolHomeworkFromImage,
  getChildHomeworkEntryEnabled,
  itemNeedsMaterial,
  listSchoolHomeworkDay,
  replaceSchoolHomeworkDay,
  schoolHomeworkDateLabel,
  SchoolHomeworkDay,
  SchoolHomeworkItem,
  SchoolHomeworkMaterial,
  signedSchoolHomeworkDocumentUrl,
  signedSchoolHomeworkImageUrl,
  setSchoolHomeworkItemDone,
  setChildHomeworkEntryEnabled,
  todayDateKey,
} from "@/lib/schoolHomework";
import { getChildHomeworkLimit, setChildHomeworkLimit, unlockChildHomeworkForToday } from "@/lib/homeworkTime";
import { supabase } from "@/lib/supabase";

const MATERIAL_CATEGORIES: { id: NonNullable<SchoolHomeworkMaterial["category"]>; label: string }[] = [
  { id: "agenda", label: "Agenda image" },
  { id: "worksheet", label: "Worksheet/material" },
  { id: "quiz", label: "Quiz/test" },
];

function inferredMaterialCategory(item: SchoolHomeworkItem): NonNullable<SchoolHomeworkMaterial["category"]> {
  if (item.task_kind === "signature") return "quiz";
  if (/quiz|test|interro|controle|contrôle|evaluation|évaluation/i.test(item.task_text)) return "quiz";
  return "worksheet";
}

export default function SchoolHomeworkManager({ childId }: { childId: string }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"agenda" | "practice">("agenda");
  const [homeworkDay, setHomeworkDay] = useState<SchoolHomeworkDay | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materialTextByItem, setMaterialTextByItem] = useState<Record<string, string>>({});
  const [materialSavingItemId, setMaterialSavingItemId] = useState<string | null>(null);
  const [editingMaterialItemIds, setEditingMaterialItemIds] = useState<Record<string, boolean>>({});
  const [limitInput, setLimitInput] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [homeworkDate, setHomeworkDate] = useState(todayDateKey());
  const [agendaCameraVisible, setAgendaCameraVisible] = useState(false);
  const [materialCameraItem, setMaterialCameraItem] = useState<SchoolHomeworkItem | null>(null);
  const [extractingAgenda, setExtractingAgenda] = useState(false);
  const [inputSourceType, setInputSourceType] = useState<"manual" | "photo" | "child">("manual");
  const [editingDay, setEditingDay] = useState(false);
  const [childEntryEnabled, setChildEntryEnabled] = useState(false);
  const [savingChildEntry, setSavingChildEntry] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [materialCategoryByItem, setMaterialCategoryByItem] = useState<Record<string, NonNullable<SchoolHomeworkMaterial["category"]>>>({});

  useEffect(() => {
    void fetchHomework();
  }, [childId, homeworkDate]);

  const fetchHomework = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const day = await listSchoolHomeworkDay(childId, homeworkDate);
      const [limit, entryEnabled] = await Promise.all([
        getChildHomeworkLimit(childId),
        getChildHomeworkEntryEnabled(childId),
      ]);
      setHomeworkDay(day);
      setRawInput(day?.raw_input || "");
      setInputSourceType(day?.source_type || "manual");
      setLimitInput(limit?.daily_limit_minutes ? String(limit.daily_limit_minutes) : "");
      setChildEntryEnabled(entryEnabled);
      setEditingMaterialItemIds({});
      setEditingDay(!day);
    } catch (err) {
      console.error("[school-homework-manager] fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChildEntry = async () => {
    try {
      setSavingChildEntry(true);
      const next = !childEntryEnabled;
      await setChildHomeworkEntryEnabled(childId, next);
      setChildEntryEnabled(next);
    } catch (err) {
      console.error("[school-homework-manager] child entry toggle error:", err);
      Alert.alert("Error", "Could not update child homework entry.");
    } finally {
      setSavingChildEntry(false);
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
        sourceType: inputSourceType,
      });
      setHomeworkDay(saved);
      setInputSourceType(saved.source_type);
      setEditingDay(false);
      Alert.alert("Saved", "School homework is ready on the child home screen.");
    } catch (err) {
      console.error("[school-homework-manager] save error:", err);
      Alert.alert("Error", "Could not save school homework.");
    } finally {
      setSaving(false);
    }
  };

  const handleAgendaPhotoCaptured = async (uri: string) => {
    try {
      setExtractingAgenda(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1300 } }],
        { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) throw new Error("Could not read agenda image");

      const extracted = await extractSchoolHomeworkFromImage(manipulated.base64, "image/jpeg");
      if (extracted.items.length === 0) {
        Alert.alert("Nothing found", "I could not find homework items in that agenda photo.");
        return;
      }

      setRawInput(extracted.items.join("\n"));
      setInputSourceType("photo");
      setEditingDay(true);
      setViewMode("agenda");
      Alert.alert(
        "Review extracted homework",
        "I filled the homework box from the agenda photo. Check it, edit anything wrong, then save."
      );
    } catch (err) {
      console.error("[school-homework-manager] agenda photo extraction error:", err);
      Alert.alert("Error", "Could not extract homework from that agenda photo.");
    } finally {
      setExtractingAgenda(false);
    }
  };

  const handlePickAgendaPhoto = async () => {
    if (extractingAgenda) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo library access to choose an agenda photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        await handleAgendaPhotoCaptured(result.assets[0].uri);
      }
    } catch (err) {
      console.error("[school-homework-manager] agenda library picker error:", err);
      Alert.alert("Error", "Could not choose an agenda photo.");
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

  const handleAttachPhoto = async (item: SchoolHomeworkItem, uri: string) => {
    try {
      setMaterialSavingItemId(item.id);
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1100 } }],
        { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) throw new Error("Could not read selected image");

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) throw new Error("Not authenticated");
      const path = `${authData.user.id}/${item.child_id}/school-homework/${Date.now()}-photo.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("worksheets")
        .upload(path, decode(manipulated.base64), { contentType: "image/jpeg", upsert: false });

      if (uploadError) throw uploadError;

      const materialResult = await addSchoolHomeworkImageMaterial({
        item,
        storagePath: path,
        bucket: "worksheets",
        imageBase64: manipulated.base64,
        category: materialCategoryByItem[item.id] || inferredMaterialCategory(item),
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

  const handleAttachDocument = async (item: SchoolHomeworkItem) => {
    try {
      setMaterialSavingItemId(item.id);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (asset.size && asset.size > 12 * 1024 * 1024) {
        Alert.alert("Document too large", "Please choose a file under 12 MB.");
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) throw new Error("Not authenticated");

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const safeName = (asset.name || "homework-document")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "homework-document";
      const path = `${authData.user.id}/${item.child_id}/school-homework/${Date.now()}-${safeName}`;
      const mimeType = asset.mimeType || "application/octet-stream";
      const { error: uploadError } = await supabase.storage
        .from("worksheets")
        .upload(path, decode(base64), { contentType: mimeType, upsert: false });

      if (uploadError) throw uploadError;

      await addSchoolHomeworkDocumentMaterial({
        item,
        storagePath: path,
        fileName: asset.name,
        mimeType,
        category: materialCategoryByItem[item.id] || inferredMaterialCategory(item),
      });
      setEditingMaterialItemIds((current) => ({ ...current, [item.id]: false }));
      await fetchHomework();
      Alert.alert("Document saved", "The child can now open this homework document.");
    } catch (err) {
      console.error("[school-homework-manager] attach document error:", err);
      Alert.alert("Error", "Could not attach the document.");
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
      await addSchoolHomeworkTextMaterial({
        item,
        textContent,
        category: materialCategoryByItem[item.id] || inferredMaterialCategory(item),
      });
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
    setMaterialCategoryByItem((current) => ({
      ...current,
      [item.id]: material?.category || inferredMaterialCategory(item),
    }));
    setEditingMaterialItemIds((current) => ({ ...current, [item.id]: true }));
  };

  const handleCreatePractice = (item: SchoolHomeworkItem) => {
    router.push({
      pathname: "/(app)/assign",
      params: {
        childId,
        schoolHomeworkItemId: item.id,
        schoolHomeworkItemText: item.task_text,
        homeworkDate,
      },
    });
  };

  const handleCreatePracticeAssignment = () => {
    router.push({
      pathname: "/(app)/assign",
      params: { childId },
    });
  };

  const handleShareDay = async () => {
    if (!homeworkDay || items.length === 0) {
      Alert.alert("Nothing to share", "Save homework for this day first.");
      return;
    }

    try {
      const lines = [
        "Skeelio homework agenda",
        schoolHomeworkDateLabel(homeworkDate),
        "",
        ...items.flatMap((item, index) => {
          const material = (item.school_homework_materials || [])[0];
          const itemLines = [
            `${index + 1}. ${item.task_text}`,
            `   Status: ${item.status === "done" ? "done" : item.status === "waiting_parent" ? "waiting for parent" : "to do"}`,
          ];
          if (item.helper_name) {
            itemLines.push(`   Helped by: ${item.helper_name}`);
          }
          if (item.linked_assignment_id || item.linked_spelling_list_id) {
            itemLines.push("   Practice: available in Skeelio");
          }
          if (material?.material_type === "text" && material.text_content) {
            itemLines.push(`   Note: ${material.text_content}`);
          }
          return itemLines;
        }),
      ];

      const attachmentLines: string[] = [];
      for (const item of items) {
        const material = (item.school_homework_materials || [])[0];
        if (!material) continue;
        const isInlineImage = material.material_type === "image" && material.text_content?.startsWith("data:image/");
        const url = material.material_type === "document"
          ? await signedSchoolHomeworkDocumentUrl(material)
          : material.material_type === "image" && !isInlineImage
            ? await signedSchoolHomeworkImageUrl(material)
            : null;
        if (url) {
          attachmentLines.push(`- ${material.title || item.task_text}: ${url}`);
        } else if (material.material_type === "image") {
          attachmentLines.push(`- ${material.title || item.task_text}: photo attached in Skeelio`);
        }
      }

      if (attachmentLines.length > 0) {
        lines.push("", "Attachments:", ...attachmentLines);
      }

      lines.push("", "Sent from Skeelio");
      await Share.share({ message: lines.join("\n") });
    } catch (err) {
      console.error("[school-homework-manager] share error:", err);
      Alert.alert("Could not share agenda", "Please try again.");
    }
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

  const items = homeworkDay?.school_homework_items || [];
  const setupItems = items.filter((item) => itemNeedsMaterial(item));
  const doneCount = items.filter((item) => item.status === "done").length;
  const totalMinutes = Math.round((homeworkDay?.total_active_seconds || 0) / 60);
  const waitingCount = items.filter((item) => item.status === "waiting_parent").length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Homework setup</Text>
          <Text style={styles.dateText}>
            {viewMode === "agenda" ? schoolHomeworkDateLabel(homeworkDate) : "Create practice separately from the daily agenda"}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color="#2196f3" /> : null}
      </View>

      <View style={styles.viewTabs}>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === "agenda" && styles.viewTabActive]}
          onPress={() => setViewMode("agenda")}
        >
          <MaterialCommunityIcons
            name="calendar-text-outline"
            size={16}
            color={viewMode === "agenda" ? "#1565c0" : "#64748b"}
          />
          <Text style={[styles.viewTabText, viewMode === "agenda" && styles.viewTabTextActive]}>
            School agenda
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewTab, viewMode === "practice" && styles.viewTabActive]}
          onPress={() => setViewMode("practice")}
        >
          <MaterialCommunityIcons
            name="school-outline"
            size={16}
            color={viewMode === "practice" ? "#1565c0" : "#64748b"}
          />
          <Text style={[styles.viewTabText, viewMode === "practice" && styles.viewTabTextActive]}>
            Practice
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === "agenda" ? (
        <>
      <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerVisible(true)}>
        <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#1565c0" />
        <View style={styles.dateButtonTextWrap}>
          <Text style={styles.dateButtonLabel}>Date</Text>
          <Text style={styles.dateButtonValue}>{schoolHomeworkDateLabel(homeworkDate)}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.moreOptionsButton}
        onPress={() => setShowMoreOptions((current) => !current)}
      >
        <MaterialCommunityIcons
          name={showMoreOptions ? "chevron-up" : "chevron-down"}
          size={18}
          color="#455a64"
        />
        <Text style={styles.moreOptionsText}>
          {showMoreOptions ? "Hide options" : "More options"}
        </Text>
      </TouchableOpacity>

      {showMoreOptions && (
        <View style={styles.advancedPanel}>
          <TouchableOpacity
            style={[styles.childEntryToggle, childEntryEnabled && styles.childEntryToggleOn]}
            onPress={() => void handleToggleChildEntry()}
            disabled={savingChildEntry}
          >
            <MaterialCommunityIcons
              name={childEntryEnabled ? "toggle-switch" : "toggle-switch-off-outline"}
              size={28}
              color={childEntryEnabled ? "#166534" : "#64748b"}
            />
            <View style={styles.childEntryToggleTextWrap}>
              <Text style={styles.childEntryToggleTitle}>Child can add homework</Text>
              <Text style={styles.childEntryToggleBody}>
                {childEntryEnabled
                  ? "On: child-entered homework appears immediately, and you can edit it."
                  : "Off: only parent-entered homework appears on the child screen."}
              </Text>
            </View>
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
        </View>
      )}

      {editingDay ? (
        <>
      <TextInput
        style={styles.input}
        value={rawInput}
        onChangeText={(text) => {
          setRawInput(text);
          setInputSourceType("manual");
        }}
        placeholder={"Paste today's homework list\nrelire R22 à R24\nPratique Liste 26\nTables multiplication par coeur 1x à 5x"}
        placeholderTextColor="#999"
        multiline
        textAlignVertical="top"
      />

      <View style={styles.inputActionRow}>
        <TouchableOpacity
          style={[styles.photoHomeworkButton, extractingAgenda && styles.saveButtonDisabled]}
          onPress={() => setAgendaCameraVisible(true)}
          disabled={extractingAgenda}
        >
          {extractingAgenda ? (
            <ActivityIndicator size="small" color="#1565c0" />
          ) : (
            <MaterialCommunityIcons name="camera-outline" size={18} color="#1565c0" />
          )}
          <Text style={styles.photoHomeworkButtonText}>
            {extractingAgenda ? "Reading agenda..." : "Take agenda photo"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoHomeworkButton, extractingAgenda && styles.saveButtonDisabled]}
          onPress={() => void handlePickAgendaPhoto()}
          disabled={extractingAgenda}
        >
          <MaterialCommunityIcons name="image-outline" size={18} color="#1565c0" />
          <Text style={styles.photoHomeworkButtonText}>
            Choose agenda photo
          </Text>
        </TouchableOpacity>
      </View>

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
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Homework summary</Text>
            <Text style={styles.summaryText}>
              {doneCount}/{items.length} complete
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
              {waitingCount > 0 ? ` · ${waitingCount} waiting for adult` : ""}
            </Text>
          </View>
          {showMoreOptions && setupItems.length > 0 && (
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
                  const canAddMaterial = item.task_kind === "generic" || needsSetup;
                  const editingMaterial = showMoreOptions && (Boolean(editingMaterialItemIds[item.id]) || needsSetup);
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
                  {showMoreOptions && (materialReady || canAddMaterial) && !editingMaterial && (
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
                {!editingMaterial &&
                  (item.school_homework_materials || [])[0]?.material_type === "document" && (
                    <View style={styles.documentPreview}>
                      <MaterialCommunityIcons name="file-document-outline" size={18} color="#1565c0" />
                      <Text style={styles.documentPreviewText} numberOfLines={1}>
                        {(item.school_homework_materials || [])[0]?.title || "Document attached"}
                      </Text>
                    </View>
                  )}
                {editingMaterial && item.task_kind !== "signature" && (
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
                    <View style={styles.categoryPicker}>
                      {MATERIAL_CATEGORIES.map((category) => {
                        const selected = (materialCategoryByItem[item.id] || inferredMaterialCategory(item)) === category.id;
                        return (
                          <TouchableOpacity
                            key={category.id}
                            style={[styles.categoryPill, selected && styles.categoryPillSelected]}
                            onPress={() => setMaterialCategoryByItem((current) => ({ ...current, [item.id]: category.id }))}
                          >
                            <Text style={[styles.categoryPillText, selected && styles.categoryPillTextSelected]}>
                              {category.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.materialActions}>
                      <TouchableOpacity
                        style={styles.materialButton}
                        onPress={() => setMaterialCameraItem(item)}
                        disabled={materialSavingItemId === item.id}
                      >
                        <MaterialCommunityIcons name="image-plus" size={16} color="#1565c0" />
                        <Text style={styles.materialButtonText}>Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.materialButton}
                        onPress={() => void handleAttachDocument(item)}
                        disabled={materialSavingItemId === item.id}
                      >
                        <MaterialCommunityIcons name="file-upload-outline" size={16} color="#1565c0" />
                        <Text style={styles.materialButtonText}>Document</Text>
                      </TouchableOpacity>
                      {item.task_kind === "generic" && (
                        <TouchableOpacity
                          style={styles.materialButton}
                          onPress={() => handleCreatePractice(item)}
                          disabled={materialSavingItemId === item.id}
                        >
                          <MaterialCommunityIcons name="school-outline" size={16} color="#1565c0" />
                          <Text style={styles.materialButtonText}>Practice</Text>
                        </TouchableOpacity>
                      )}
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
                {item.task_kind === "signature" && item.status !== "done" && (
                  <Text style={styles.signatureHint}>
                    Parent-only item. Mark it complete here after the quiz or note has been signed.
                  </Text>
                )}
                    </>
                  );
                })()}
              </View>
            </View>
          ))}
        </View>
      )}
        </>
      ) : homeworkDay ? (
        <View style={styles.savedAgenda}>
          <View style={styles.savedAgendaHeader}>
            <View style={styles.savedAgendaTitleWrap}>
              <Text style={styles.savedAgendaTitle}>Saved agenda</Text>
              <Text style={styles.savedAgendaMeta}>
                {doneCount}/{items.length} complete
                {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
                {waitingCount > 0 ? ` · ${waitingCount} waiting for adult` : ""}
              </Text>
            </View>
            <View style={styles.savedAgendaActions}>
              {showMoreOptions && (
                <TouchableOpacity style={styles.savedAgendaButton} onPress={() => void handleShareDay()}>
                  <MaterialCommunityIcons name="share-variant-outline" size={16} color="#1565c0" />
                  <Text style={styles.savedAgendaButtonText}>Share</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.savedAgendaButton} onPress={() => setEditingDay(true)}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color="#1565c0" />
                <Text style={styles.savedAgendaButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>

          {items.length === 0 ? (
            <Text style={styles.schoolHomeworkEmpty}>No items saved for this day.</Text>
          ) : (
            items.map((item) => {
              const material = (item.school_homework_materials || [])[0];
              const done = item.status === "done";
              return (
                <View key={item.id} style={styles.savedAgendaItem}>
                  <TouchableOpacity
                    style={styles.previewCheck}
                    onPress={() => void handleToggleItem(item)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={done ? "check-circle" : "checkbox-blank-circle-outline"}
                      size={18}
                      color={done ? "#4caf50" : "#90a4ae"}
                    />
                  </TouchableOpacity>
                  <View style={styles.previewTextWrap}>
                    <Text style={[styles.previewText, done && styles.savedAgendaDoneText]}>
                      {item.task_text}
                    </Text>
                    <Text style={styles.previewMeta}>
                      {item.linked_assignment_id || item.linked_spelling_list_id
                        ? `${item.task_kind} · linked practice`
                        : material
                          ? `${item.task_kind} · ${material.material_type} attached`
                          : item.status === "waiting_parent"
                            ? "waiting for parent"
                            : item.task_kind}
                    {item.helper_name ? ` · helped by ${item.helper_name}` : ""}
                  </Text>
                  </View>
                  {item.task_kind === "generic" && !item.linked_assignment_id ? (
                    <TouchableOpacity style={styles.compactPracticeButton} onPress={() => handleCreatePractice(item)}>
                      <Text style={styles.compactPracticeButtonText}>Practice</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ) : null}
        </>
      ) : (
        <View style={styles.practicePanel}>
          <View style={styles.practicePanelIcon}>
            <MaterialCommunityIcons name="school-outline" size={24} color="#f97316" />
          </View>
          <Text style={styles.practicePanelTitle}>Practice assignments</Text>
          <Text style={styles.practicePanelBody}>
            Create math, spelling, or conjugation practice here. If you start from a saved agenda item, Skeelio will prefill the day and link it back to the child{"'"}s homework feed.
          </Text>
          <TouchableOpacity style={styles.practicePanelButton} onPress={handleCreatePracticeAssignment}>
            <MaterialCommunityIcons name="playlist-plus" size={18} color="#fff" />
            <Text style={styles.practicePanelButtonText}>Create practice assignment</Text>
          </TouchableOpacity>
        </View>
      )}
      <DatePickerModal
        visible={datePickerVisible}
        selectedDate={homeworkDate}
        onSelect={setHomeworkDate}
        onClose={() => setDatePickerVisible(false)}
      />
      <CameraCaptureModal
        visible={agendaCameraVisible}
        onCaptured={(uri) => {
          setAgendaCameraVisible(false);
          void handleAgendaPhotoCaptured(uri);
        }}
        onClose={() => setAgendaCameraVisible(false)}
      />
      <CameraCaptureModal
        visible={Boolean(materialCameraItem)}
        onCaptured={(uri) => {
          const item = materialCameraItem;
          setMaterialCameraItem(null);
          if (item) void handleAttachPhoto(item, uri);
        }}
        onClose={() => setMaterialCameraItem(null)}
      />
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
  viewTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  viewTab: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe3ea",
    backgroundColor: "#f8fafc",
  },
  viewTabActive: {
    borderColor: "#90caf9",
    backgroundColor: "#e3f2fd",
  },
  viewTabText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },
  viewTabTextActive: {
    color: "#1565c0",
  },
  moreOptionsButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    marginBottom: 12,
  },
  moreOptionsText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#455a64",
  },
  advancedPanel: {
    gap: 10,
    marginBottom: 12,
  },
  childEntryToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    marginBottom: 12,
  },
  childEntryToggleOn: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },
  childEntryToggleTextWrap: {
    flex: 1,
  },
  childEntryToggleTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  childEntryToggleBody: {
    fontSize: 12,
    lineHeight: 16,
    color: "#475569",
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
  inputActionRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  photoHomeworkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
    borderWidth: 1,
    borderColor: "#bbdefb",
  },
  photoHomeworkButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1565c0",
  },
  dateButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbdefb",
    backgroundColor: "#e3f2fd",
    marginBottom: 12,
  },
  dateButtonTextWrap: {
    flex: 1,
  },
  dateButtonLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565c0",
  },
  dateButtonValue: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
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
  savedAgenda: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8e5",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  savedAgendaHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f2",
  },
  savedAgendaTitleWrap: {
    flex: 1,
  },
  savedAgendaTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#263238",
  },
  savedAgendaMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#607d8b",
  },
  savedAgendaActions: {
    flexDirection: "row",
    gap: 6,
  },
  savedAgendaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eef7ff",
  },
  savedAgendaButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565c0",
  },
  savedAgendaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  savedAgendaDoneText: {
    color: "#78909c",
    textDecorationLine: "line-through",
  },
  schoolHomeworkEmpty: {
    padding: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#78909c",
  },
  compactPracticeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
  },
  compactPracticeButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565c0",
  },
  practicePanel: {
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
  },
  practicePanelIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  practicePanelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#9a3412",
  },
  practicePanelBody: {
    marginTop: 5,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#7c2d12",
  },
  practicePanelButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f97316",
  },
  practicePanelButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
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
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  categoryPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  categoryPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e2ec",
    backgroundColor: "#fff",
  },
  categoryPillSelected: {
    borderColor: "#90caf9",
    backgroundColor: "#e3f2fd",
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
  },
  categoryPillTextSelected: {
    color: "#1565c0",
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
  documentPreview: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
  },
  documentPreviewText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#1565c0",
  },
  signatureHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "#795548",
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
