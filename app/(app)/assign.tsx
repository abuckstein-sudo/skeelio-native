import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import { Operation } from "@/lib/tutorConfig";
import {
  listAssignmentsForChild,
  createMathAssignment,
  createSpellingAssignment,
  deleteAssignment,
  Assignment,
} from "@/lib/assignments";
import {
  listSpellingListsForChild,
  createSpellingList,
  createSpellingItems,
  deleteSpellingList,
  parseManualWords,
  extractWordsFromImage,
  type SpellingList,
  type SpellingLanguage,
} from "@/lib/spelling";
import { getWordsForLevel } from "@/lib/wordBank";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  languages?: any;
}

export default function AssignScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ childId: string; childName?: string }>();
  const id = String(params.childId || "");
  const paramName = params.childName ? String(params.childName) : "";

  const [child, setChild] = useState<Child | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Homework assignment state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentSubject, setAssignmentSubject] = useState<"math" | "spelling" | "conjugation">("math");
  const [selectedTopic, setSelectedTopic] = useState<Operation | "word_problems">("addition");
  const [selectedWordProblemOp, setSelectedWordProblemOp] = useState<Operation | "mixed">("mixed");
  const [questionCount, setQuestionCount] = useState(8);
  const [dueDate, setDueDate] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"practice" | "quiz">("practice");
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [showCompletedAssignments, setShowCompletedAssignments] = useState(true);
  const [selectedSpellingList, setSelectedSpellingList] = useState<SpellingList | null>(null);
  const [conjugationLanguage, setConjugationLanguage] = useState<string>("");
  const [conjugationLanguages, setConjugationLanguages] = useState<Array<{ locale: string; name: string }>>([]);
  const [conjugationVerbGroups, setConjugationVerbGroups] = useState<string[]>([]);
  const [conjugationVerbGroupOptions, setConjugationVerbGroupOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [conjugationTenses, setConjugationTenses] = useState<string[]>([]);
  const [conjugationTenseOptions, setConjugationTenseOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isGeneratingNewList, setIsGeneratingNewList] = useState(false);
  const [generateLanguage, setGenerateLanguage] = useState<SpellingLanguage>("English");
  const [generateWordCount, setGenerateWordCount] = useState("10");

  // Spelling list state
  const [spellingLists, setSpellingLists] = useState<SpellingList[]>([]);
  const [showSpellingForm, setShowSpellingForm] = useState(false);
  const [spellingTitle, setSpellingTitle] = useState("");
  const [spellingLanguage, setSpellingLanguage] = useState<SpellingLanguage>("English");
  const [spellingWords, setSpellingWords] = useState("");
  const [isCreatingSpellingList, setIsCreatingSpellingList] = useState(false);

  // Photo extraction state
  const [showPhotoReview, setShowPhotoReview] = useState(false);
  const [extractedWords, setExtractedWords] = useState<string[]>([]);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewLanguage, setReviewLanguage] = useState<SpellingLanguage>("English");
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);

  const fetchAssignments = useCallback(async () => {
    if (!id) return;
    const assns = await listAssignmentsForChild(id);
    setAssignments(assns);
  }, [id]);

  const fetchSpellingLists = useCallback(async () => {
    if (!id) return;
    try {
      const lists = await listSpellingListsForChild(id);
      setSpellingLists(lists);
    } catch (err) {
      console.error("[assign] error fetching spelling lists:", err);
    }
  }, [id]);

  const loadConjugationLanguages = useCallback(async () => {
    if (!id) return;
    try {
      const { data: childData, error } = await supabase
        .from("children")
        .select("languages, preferred_language")
        .eq("id", id)
        .single();

      if (error) throw error;

      const langs = (childData?.languages as any) || [];
      const langs_array = Array.isArray(langs) ? langs : (typeof langs === "string" ? JSON.parse(langs) : []);

      const languageMap: Record<string, { locale: string; name: string }> = {
        "French": { locale: "fr-FR", name: "French" },
        "English": { locale: "en-CA", name: "English" },
      };

      const available = langs_array
        .map((lang: string) => languageMap[lang])
        .filter(Boolean);

      setConjugationLanguages(available);
      if (available.length === 1) {
        setConjugationLanguage(available[0].locale);
        await loadConjugationOptions(available[0].locale);
      }
    } catch (err) {
      console.error("[assign] error loading conjugation languages:", err);
    }
  }, [id]);

  const loadConjugationOptions = async (language: string) => {
    try {
      const { data, error } = await supabase
        .from("conjugation_questions")
        .select("verb_group, tense")
        .eq("language", language);

      if (error) throw error;

      const uniqueGroups = new Set<string>();
      const uniqueTenses = new Set<string>();

      (data || []).forEach((q) => {
        uniqueGroups.add(q.verb_group);
        uniqueTenses.add(q.tense);
      });

      const { getLabelForVerbGroup, getLabelForTense } = await import("@/lib/conjugation");

      const groups = Array.from(uniqueGroups)
        .map((g) => ({
          value: g,
          label: getLabelForVerbGroup(g),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const tenses = Array.from(uniqueTenses)
        .map((t) => ({
          value: t,
          label: getLabelForTense(t),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      setConjugationVerbGroupOptions(groups);
      setConjugationTenseOptions(tenses);
      setConjugationVerbGroups([]);
      setConjugationTenses([]);
    } catch (err) {
      console.error("[assign] error loading conjugation options:", err);
    }
  };

  const handleCreateAssignment = async () => {
    if (!id || !session?.user?.id) return;

    if (assignmentSubject === "math") {
      setIsCreatingAssignment(true);
      try {
        await createMathAssignment({
          childId: id,
          topic: selectedTopic,
          count: questionCount,
          dueDate: dueDate || undefined,
          mode: assignmentMode,
          wordProblemOp: selectedTopic === "word_problems" ? selectedWordProblemOp : undefined,
        });

        await fetchAssignments();

        setShowAssignmentForm(false);
        setSelectedTopic("addition");
        setQuestionCount(8);
        setDueDate("");
        setAssignmentMode("practice");
      } catch (err) {
        console.error("[assignments] error creating math assignment:", err);
        Alert.alert("Error", "Failed to create assignment");
      } finally {
        setIsCreatingAssignment(false);
      }
    } else if (assignmentSubject === "spelling") {
      if (isGeneratingNewList) {
        await handleGenerateAndAssignList();
        return;
      }

      if (!selectedSpellingList) {
        Alert.alert("Error", "Please select a spelling list or choose 'Generate New List'");
        return;
      }

      setIsCreatingAssignment(true);
      try {
        await createSpellingAssignment(
          id,
          selectedSpellingList.id,
          selectedSpellingList.title,
          0,
          "practice",
          dueDate || undefined
        );

        await fetchAssignments();

        setShowAssignmentForm(false);
        setSelectedSpellingList(null);
        setDueDate("");
        setAssignmentSubject("math");
      } catch (err) {
        console.error("[assignments] error creating spelling assignment:", err);
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to create assignment");
      } finally {
        setIsCreatingAssignment(false);
      }
    } else if (assignmentSubject === "conjugation") {
      if (!conjugationLanguage || conjugationVerbGroups.length === 0 || conjugationTenses.length === 0) {
        Alert.alert("Error", "Please select a language, at least one verb type, and at least one tense");
        return;
      }

      setIsCreatingAssignment(true);
      try {
        const { createConjugationAssignment } = await import("@/lib/assignments");
        await createConjugationAssignment(
          id,
          conjugationLanguage,
          conjugationVerbGroups,
          conjugationTenses,
          questionCount,
          dueDate || undefined
        );

        await fetchAssignments();

        setShowAssignmentForm(false);
        setAssignmentSubject("math");
        setConjugationLanguage("");
        setConjugationVerbGroups([]);
        setConjugationTenses([]);
        setQuestionCount(8);
        setDueDate("");
      } catch (err) {
        console.error("[assignments] error creating conjugation assignment:", err);
        Alert.alert("Error", "Failed to create conjugation assignment");
      } finally {
        setIsCreatingAssignment(false);
      }
    }
  };

  const handleGenerateAndAssignList = async () => {
    if (!id || !child) return;

    const wordCount = parseInt(generateWordCount, 10);
    if (isNaN(wordCount) || wordCount < 1 || wordCount > 30) {
      Alert.alert("Error", "Word count must be between 1 and 30");
      return;
    }

    setIsCreatingAssignment(true);
    try {
      const words = getWordsForLevel(
        generateLanguage,
        child.grade_level || "3",
        wordCount
      );

      if (words.length === 0) {
        Alert.alert("Error", "No words available for this level");
        setIsCreatingAssignment(false);
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const listTitle = `Generated · ${today}`;

      const newList = await createSpellingList(
        id,
        listTitle,
        generateLanguage,
        "manual"
      );

      await createSpellingItems(newList.id, id, words, generateLanguage);

      await createSpellingAssignment(
        id,
        newList.id,
        listTitle,
        words.length,
        "practice",
        dueDate || undefined
      );

      await fetchAssignments();
      await fetchSpellingLists();

      setShowAssignmentForm(false);
      setAssignmentSubject("math");
      setSelectedSpellingList(null);
      setDueDate("");
      setGenerateWordCount("10");
      setGenerateLanguage("English");
      setIsGeneratingNewList(false);

      Alert.alert("Success", `Created list with ${words.length} words`);
    } catch (err) {
      console.error("[handleGenerateAndAssignList] error:", err);
      Alert.alert("Error", "Failed to generate and assign list");
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const proceedWithGenerateSpelling = (language: SpellingLanguage) => {
    if (!child) return;

    const wordCount = 10;

    try {
      const words = getWordsForLevel(
        language,
        child.grade_level || "3",
        wordCount
      );

      if (words.length === 0) {
        Alert.alert("Error", "No words available for this level");
        return;
      }

      const gradeDisplay = child.grade_level || "Spelling";
      setSpellingTitle(`${gradeDisplay} spelling`);
      setSpellingLanguage(language);
      setSpellingWords(words.join(", "));
      setShowSpellingForm(true);
    } catch (err) {
      console.error("[proceedWithGenerateSpelling] error:", err);
      Alert.alert("Error", "Failed to generate words");
    }
  };

  const handleGenerateSpellingList = () => {
    if (!child) return;

    const childLanguages = (child as any).languages as any || [];
    const langs_array = Array.isArray(childLanguages) ? childLanguages : (typeof childLanguages === "string" ? JSON.parse(childLanguages) : []);

    if (langs_array.length > 1) {
      Alert.alert(
        "Choose language",
        "Which language would you like to generate words in?",
        langs_array.map((lang: string) => ({
          text: lang,
          onPress: () => proceedWithGenerateSpelling(lang as SpellingLanguage),
        })).concat([
          { text: "Cancel", style: "cancel" },
        ])
      );
    } else if (langs_array.length === 1) {
      proceedWithGenerateSpelling(langs_array[0] as SpellingLanguage);
    } else {
      proceedWithGenerateSpelling("English");
    }
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    Alert.alert(
      "Delete Assignment",
      "Are you sure? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAssignment(assignmentId);
              await fetchAssignments();
            } catch (err) {
              console.error("[assignments] error deleting:", err);
              Alert.alert("Error", "Failed to delete assignment");
            }
          },
        },
      ]
    );
  };

  const handleCreateSpellingList = async () => {
    if (!id || !spellingTitle.trim() || !spellingWords.trim()) {
      Alert.alert("Error", "Please enter a title and words");
      return;
    }

    setIsCreatingSpellingList(true);
    try {
      const words = parseManualWords(spellingWords);
      if (words.length === 0) {
        Alert.alert("Error", "No valid words found");
        setIsCreatingSpellingList(false);
        return;
      }

      const list = await createSpellingList(
        id,
        spellingTitle.trim(),
        spellingLanguage,
        "manual"
      );

      await createSpellingItems(list.id, id, words, spellingLanguage);

      await fetchSpellingLists();

      setShowSpellingForm(false);
      setSpellingTitle("");
      setSpellingWords("");
      setSpellingLanguage("English");

      Alert.alert("Success", `Created list with ${words.length} words`);
    } catch (err) {
      console.error("[spelling] error creating list:", err);
      Alert.alert("Error", "Failed to create spelling list");
    } finally {
      setIsCreatingSpellingList(false);
    }
  };

  const handleDeleteSpellingList = (listId: string) => {
    Alert.alert(
      "Delete Spelling List",
      "Are you sure? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSpellingList(listId);
              await fetchSpellingLists();
            } catch (err) {
              console.error("[spelling] error deleting list:", err);
              Alert.alert("Error", "Failed to delete list");
            }
          },
        },
      ]
    );
  };

  const processCapturedImage = async (uri: string) => {
    try {
      if (!uri) {
        Alert.alert("Error", "Could not read image");
        return;
      }

      setIsExtractingPhoto(true);

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1500 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        Alert.alert("Error", "Could not process image");
        setIsExtractingPhoto(false);
        return;
      }

      const { words, language } = await extractWordsFromImage(manipulated.base64, "image/jpeg");

      if (words.length === 0) {
        Alert.alert("Error", "No words could be extracted from the image");
        setIsExtractingPhoto(false);
        return;
      }

      setExtractedWords(words);
      setReviewLanguage(language);
      setReviewTitle("");
      setShowPhotoReview(true);
    } catch (err) {
      console.error("[processCapturedImage] error:", err);
      Alert.alert("Error", "Failed to extract words from image");
    } finally {
      setIsExtractingPhoto(false);
    }
  };

  const handleSavePhotoList = async () => {
    if (!id || !reviewTitle.trim()) {
      Alert.alert("Error", "Please enter a title");
      return;
    }

    if (extractedWords.length === 0) {
      Alert.alert("Error", "No words to save");
      return;
    }

    setIsCreatingSpellingList(true);
    try {
      const list = await createSpellingList(
        id,
        reviewTitle.trim(),
        reviewLanguage,
        "photo"
      );

      await createSpellingItems(list.id, id, extractedWords, reviewLanguage);

      await fetchSpellingLists();

      setShowPhotoReview(false);
      setExtractedWords([]);
      setReviewTitle("");
      setReviewLanguage("English");

      Alert.alert("Success", `Created list with ${extractedWords.length} words`);
    } catch (err) {
      console.error("[handleSavePhotoList] error:", err);
      Alert.alert("Error", "Failed to save list");
    } finally {
      setIsCreatingSpellingList(false);
    }
  };

  const fetchChild = async () => {
    if (!id) return;
    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, languages")
      .eq("id", id)
      .single();

    if (dbError) {
      console.log("[assign] child fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    setChild(data as any);

    const assns = await listAssignmentsForChild(id);
    setAssignments(assns);

    const lists = await listSpellingListsForChild(id);
    setSpellingLists(lists);

    setIsLoading(false);
  };

  useEffect(() => {
    if (id) fetchChild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchAssignments();
      fetchSpellingLists();
    }, [fetchAssignments, fetchSpellingLists]),
  );

  const handleScanWorksheet = () => {
    if (!id) return;
    router.push({
      pathname: "/(app)/scan",
      params: { childId: id },
    });
  };

  const openSelectTopic = () => {
    setShowAssignmentForm(true);
    loadConjugationLanguages();
  };

  const addSpellingList = () => {
    Alert.alert(
      "Add a spelling list",
      "Choose how to add a list:",
      [
        { text: "Take or upload a photo", onPress: () => setCameraVisible(true) },
        { text: "Manual entry", onPress: () => setShowSpellingForm(true) },
        { text: "Skeelio generates", onPress: () => handleGenerateSpellingList() },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const displayName = child?.name || paramName || "this child";

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2196f3" />
        </View>
      </SafeAreaView>
    );
  }

  const cap = (s?: string | null) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  const activeAssignments = assignments.filter((a) => a.status !== "complete");
  const completedAssignments = assignments
    .filter((a) => a.status === "complete")
    .sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return dateB - dateA;
    });

  const renderAssignmentRow = (asn: Assignment) => (
    <View
      key={asn.id}
      style={[
        styles.homeworkRow,
        asn.status === "complete" && styles.homeworkRowCompleted,
      ]}
    >
      <View style={styles.homeworkInfo}>
        <Text style={styles.homeworkTopic}>
          {cap(asn.focus) || cap(asn.subject) || "Practice"}
        </Text>
        <Text style={styles.homeworkDetails}>
          {asn.question_count} questions • {asn.mode === "quiz" ? "Quiz" : "Practice"}
          {asn.due_date &&
            ` • Due: ${new Date(asn.due_date).toLocaleDateString()}`}
        </Text>
        {asn.status === "complete" && asn.completed_at && (
          <Text style={styles.completedDate}>
            Completed: {new Date(asn.completed_at).toLocaleDateString()}
          </Text>
        )}
      </View>
      <View style={styles.actionButtons}>
        {asn.status !== "complete" && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteAssignment(asn.id)}
          >
            <Text style={styles.deleteButtonText}>✕</Text>
          </TouchableOpacity>
        )}
        <View
          style={[
            styles.statusBadge,
            asn.status === "complete" ? styles.statusCompleted : styles.statusActive,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              asn.status === "complete" && styles.statusBadgeTextCompleted,
            ]}
          >
            {asn.status === "complete" ? "✓" : "→"}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.childHeaderRow}>
        <TouchableOpacity style={styles.gearButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.childHeaderName}>Assign to {displayName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Two primary actions */}
        <TouchableOpacity style={styles.bigAction} onPress={handleScanWorksheet}>
          <MaterialCommunityIcons name="camera" size={22} color="#fff" />
          <View style={styles.bigActionTextWrap}>
            <Text style={styles.bigActionTitle}>Scan a worksheet</Text>
            <Text style={styles.bigActionSub}>Photograph homework and Skeelio builds practice</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bigAction} onPress={openSelectTopic}>
          <MaterialCommunityIcons name="format-list-bulleted" size={22} color="#fff" />
          <View style={styles.bigActionTextWrap}>
            <Text style={styles.bigActionTitle}>Select a topic</Text>
            <Text style={styles.bigActionSub}>Math, spelling, or conjugation — pick and assign</Text>
          </View>
        </TouchableOpacity>

        {/* Assigned work */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned</Text>
          {assignments.length === 0 ? (
            <Text style={styles.emptyItemText}>No assignments yet</Text>
          ) : (
            <>
              {activeAssignments.length > 0 ? (
                activeAssignments.map(renderAssignmentRow)
              ) : (
                <Text style={styles.emptyItemText}>No active homework</Text>
              )}

            </>
          )}
        </View>

        {/* Spelling lists */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Spelling lists</Text>
            <TouchableOpacity style={styles.addButton} onPress={addSpellingList}>
              <Text style={styles.addButtonText}>+ Add list</Text>
            </TouchableOpacity>
          </View>
          {spellingLists.length === 0 ? (
            <Text style={styles.emptyItemText}>No lists yet</Text>
          ) : (
            spellingLists.map((list) => (
              <View key={list.id} style={styles.homeworkRow}>
                <View style={styles.homeworkInfo}>
                  <Text style={styles.homeworkTopic}>{list.title}</Text>
                  <Text style={styles.homeworkDetails}>
                    {list.language} · {list.source_type === "photo" ? "Photo" : "Manual"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteSpellingList(list.id)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Assignment Form Modal */}
      <Modal
        visible={showAssignmentForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => !isCreatingAssignment && setShowAssignmentForm(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Assign Homework</Text>

                {/* Subject Selector */}
                <Text style={styles.formLabel}>Subject</Text>
                <View style={styles.topicPickerRow}>
                  <TouchableOpacity
                    style={[styles.topicButton, assignmentSubject === "math" && styles.topicButtonActive]}
                    onPress={() => setAssignmentSubject("math")}
                  >
                    <Text style={[styles.topicButtonText, assignmentSubject === "math" && styles.topicButtonTextActive]}>
                      Math
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.topicButton, assignmentSubject === "spelling" && styles.topicButtonActive]}
                    onPress={() => setAssignmentSubject("spelling")}
                  >
                    <Text style={[styles.topicButtonText, assignmentSubject === "spelling" && styles.topicButtonTextActive]}>
                      Spelling
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.topicButton, assignmentSubject === "conjugation" && styles.topicButtonActive]}
                    onPress={() => setAssignmentSubject("conjugation")}
                  >
                    <Text style={[styles.topicButtonText, assignmentSubject === "conjugation" && styles.topicButtonTextActive]}>
                      Conjugation
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Math Form */}
                {assignmentSubject === "math" && (
                  <>
                    <Text style={styles.formLabel}>Topic</Text>
                    <View style={styles.topicPickerRow}>
                      {["addition", "subtraction", "multiplication", "division", "word_problems"].map((topic) => (
                        <TouchableOpacity
                          key={topic}
                          style={[styles.topicButton, selectedTopic === topic && styles.topicButtonActive]}
                          onPress={() => setSelectedTopic(topic as Operation | "word_problems")}
                        >
                          <Text style={[styles.topicButtonText, selectedTopic === topic && styles.topicButtonTextActive]}>
                            {topic === "word_problems" ? "Word Problems" : topic.charAt(0).toUpperCase() + topic.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {selectedTopic === "word_problems" && (
                      <>
                        <Text style={styles.formLabel}>Operation</Text>
                        <View style={styles.topicPickerRow}>
                          {["addition", "subtraction", "multiplication", "division", "mixed"].map((op) => (
                            <TouchableOpacity
                              key={op}
                              style={[styles.topicButton, selectedWordProblemOp === op && styles.topicButtonActive]}
                              onPress={() => setSelectedWordProblemOp(op as Operation | "mixed")}
                            >
                              <Text style={[styles.topicButtonText, selectedWordProblemOp === op && styles.topicButtonTextActive]}>
                                {op === "mixed" ? "Mixed" : op.charAt(0).toUpperCase() + op.slice(1)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    <Text style={styles.formLabel}>Number of Questions</Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setQuestionCount(Math.max(1, questionCount - 1))}
                      >
                        <Text style={styles.counterButtonText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.counterValue}>{questionCount}</Text>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => setQuestionCount(Math.min(20, questionCount + 1))}
                      >
                        <Text style={styles.counterButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.formLabel}>Mode</Text>
                    <View style={styles.modeToggleRow}>
                      <TouchableOpacity
                        style={[styles.modeButton, assignmentMode === "practice" && styles.modeButtonActive]}
                        onPress={() => setAssignmentMode("practice")}
                      >
                        <Text style={[styles.modeButtonText, assignmentMode === "practice" && styles.modeButtonTextActive]}>
                          Practice
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeButton, assignmentMode === "quiz" && styles.modeButtonActive]}
                        onPress={() => setAssignmentMode("quiz")}
                      >
                        <Text style={[styles.modeButtonText, assignmentMode === "quiz" && styles.modeButtonTextActive]}>
                          Quiz
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.formLabel}>Due Date (optional)</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      value={dueDate}
                      onChangeText={setDueDate}
                      editable={!isCreatingAssignment}
                    />
                  </>
                )}

                {/* Spelling Form */}
                {assignmentSubject === "spelling" && (
                  <>
                    <Text style={styles.formLabel}>Choose List</Text>
                    <View style={styles.subjectPickerRow}>
                      {spellingLists.length === 0 ? (
                        <Text style={styles.emptyText}>No lists available</Text>
                      ) : (
                        spellingLists.map((list) => (
                          <TouchableOpacity
                            key={list.id}
                            style={[styles.topicButton, selectedSpellingList?.id === list.id && styles.topicButtonActive]}
                            onPress={() => setSelectedSpellingList(list)}
                          >
                            <Text style={[styles.topicButtonText, selectedSpellingList?.id === list.id && styles.topicButtonTextActive]}>
                              {list.title}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.topicButton, isGeneratingNewList && styles.topicButtonActive]}
                      onPress={() => setIsGeneratingNewList(!isGeneratingNewList)}
                      disabled={isCreatingAssignment}
                    >
                      <Text style={[styles.topicButtonText, isGeneratingNewList && styles.topicButtonTextActive]}>
                        Generate New List
                      </Text>
                    </TouchableOpacity>

                    {isGeneratingNewList && (
                      <>
                        <Text style={styles.formLabel}>Language</Text>
                        <View style={styles.topicPickerRow}>
                          {["English", "French"].map((lang) => (
                            <TouchableOpacity
                              key={lang}
                              style={[styles.topicButton, generateLanguage === lang && styles.topicButtonActive]}
                              onPress={() => setGenerateLanguage(lang as SpellingLanguage)}
                              disabled={isCreatingAssignment}
                            >
                              <Text style={[styles.topicButtonText, generateLanguage === lang && styles.topicButtonTextActive]}>
                                {lang}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.formLabel}>Word Count</Text>
                        <TextInput
                          style={styles.numberInput}
                          placeholder="10"
                          value={generateWordCount}
                          onChangeText={setGenerateWordCount}
                          keyboardType="number-pad"
                          editable={!isCreatingAssignment}
                        />
                        <Text style={styles.smallText}>Between 1 and 30 words</Text>
                      </>
                    )}

                    <Text style={styles.formLabel}>Due Date (optional)</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      value={dueDate}
                      onChangeText={setDueDate}
                      editable={!isCreatingAssignment}
                    />
                  </>
                )}

                {/* Conjugation Form */}
                {assignmentSubject === "conjugation" && (
                  <>
                    {conjugationLanguages.length > 1 && (
                      <>
                        <Text style={styles.formLabel}>Language</Text>
                        <View style={styles.topicPickerRow}>
                          {conjugationLanguages.map((lang) => (
                            <TouchableOpacity
                              key={lang.locale}
                              style={[styles.topicButton, conjugationLanguage === lang.locale && styles.topicButtonActive]}
                              onPress={async () => {
                                setConjugationLanguage(lang.locale);
                                await loadConjugationOptions(lang.locale);
                              }}
                              disabled={isCreatingAssignment}
                            >
                              <Text style={[styles.topicButtonText, conjugationLanguage === lang.locale && styles.topicButtonTextActive]}>
                                {lang.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    <Text style={styles.formLabel}>Verb Types (select at least one)</Text>
                    <View style={styles.topicPickerRow}>
                      {conjugationVerbGroupOptions.map((group) => (
                        <TouchableOpacity
                          key={group.value}
                          style={[styles.topicButton, conjugationVerbGroups.includes(group.value) && styles.topicButtonActive]}
                          onPress={() => {
                            if (conjugationVerbGroups.includes(group.value)) {
                              setConjugationVerbGroups(conjugationVerbGroups.filter((g) => g !== group.value));
                            } else {
                              setConjugationVerbGroups([...conjugationVerbGroups, group.value]);
                            }
                          }}
                          disabled={isCreatingAssignment}
                        >
                          <Text style={[styles.topicButtonText, conjugationVerbGroups.includes(group.value) && styles.topicButtonTextActive]}>
                            {group.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.formLabel}>Tenses (select at least one)</Text>
                    <View style={styles.topicPickerRow}>
                      {conjugationTenseOptions.map((tense) => (
                        <TouchableOpacity
                          key={tense.value}
                          style={[styles.topicButton, conjugationTenses.includes(tense.value) && styles.topicButtonActive]}
                          onPress={() => {
                            if (conjugationTenses.includes(tense.value)) {
                              setConjugationTenses(conjugationTenses.filter((t) => t !== tense.value));
                            } else {
                              setConjugationTenses([...conjugationTenses, tense.value]);
                            }
                          }}
                          disabled={isCreatingAssignment}
                        >
                          <Text style={[styles.topicButtonText, conjugationTenses.includes(tense.value) && styles.topicButtonTextActive]}>
                            {tense.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.formLabel}>Question Count</Text>
                    <TextInput
                      style={styles.numberInput}
                      placeholder="10"
                      value={assignmentSubject === "conjugation" ? String(questionCount) : ""}
                      onChangeText={(text) => setQuestionCount(parseInt(text, 10) || 10)}
                      keyboardType="number-pad"
                      editable={!isCreatingAssignment}
                    />

                    <Text style={styles.formLabel}>Due Date (optional)</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      value={dueDate}
                      onChangeText={setDueDate}
                      editable={!isCreatingAssignment}
                    />
                  </>
                )}

                {/* Action Buttons */}
                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity
                    style={[styles.button, !isCreatingAssignment && styles.buttonSecondary]}
                    onPress={() => {
                      if (!isCreatingAssignment) {
                        setShowAssignmentForm(false);
                        setAssignmentSubject("math");
                        setSelectedTopic("addition");
                        setQuestionCount(8);
                        setDueDate("");
                        setAssignmentMode("practice");
                        setSelectedSpellingList(null);
                        setIsGeneratingNewList(false);
                      }
                    }}
                    disabled={isCreatingAssignment}
                  >
                    <Text style={[styles.buttonText, styles.buttonSecondaryText]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonPrimary]}
                    onPress={handleCreateAssignment}
                    disabled={isCreatingAssignment}
                  >
                    {isCreatingAssignment ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Create Assignment</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Spelling List Form Modal */}
      <Modal
        visible={showSpellingForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => !isCreatingSpellingList && setShowSpellingForm(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Add Spelling List</Text>

                <Text style={styles.formLabel}>List Title</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., 'Week 1 Spellings'"
                  value={spellingTitle}
                  onChangeText={setSpellingTitle}
                  editable={!isCreatingSpellingList}
                />

                <Text style={styles.formLabel}>Language</Text>
                <View style={styles.topicPickerRow}>
                  {(["English", "French"] as const).map((lang) => (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.topicButton, spellingLanguage === lang && styles.topicButtonActive]}
                      onPress={() => setSpellingLanguage(lang)}
                      disabled={isCreatingSpellingList}
                    >
                      <Text style={[styles.topicButtonText, spellingLanguage === lang && styles.topicButtonTextActive]}>
                        {lang}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Words (comma, newline, or semicolon separated)</Text>
                <TextInput
                  style={[styles.formInput, styles.multilineInput]}
                  placeholder="beautiful, house, yellow"
                  value={spellingWords}
                  onChangeText={setSpellingWords}
                  multiline={true}
                  numberOfLines={6}
                  editable={!isCreatingSpellingList}
                />

                <TouchableOpacity
                  style={[styles.submitButton, isCreatingSpellingList && styles.submitButtonDisabled]}
                  onPress={handleCreateSpellingList}
                  disabled={isCreatingSpellingList}
                >
                  {isCreatingSpellingList ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Create List</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowSpellingForm(false);
                    setSpellingTitle("");
                    setSpellingWords("");
                    setSpellingLanguage("English");
                  }}
                  disabled={isCreatingSpellingList}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Photo Review Modal */}
      <Modal
        visible={showPhotoReview}
        transparent={false}
        animationType="slide"
        onRequestClose={() => !isCreatingSpellingList && setShowPhotoReview(false)}
      >
        <SafeAreaView style={styles.photoReviewContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View style={styles.photoReviewHeader}>
              <Text style={styles.modalTitle}>Review & Edit Words</Text>

              <Text style={styles.formLabel}>List Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter list title"
                value={reviewTitle}
                onChangeText={setReviewTitle}
                editable={!isCreatingSpellingList}
              />

              <Text style={styles.formLabel}>Language</Text>
              <View style={styles.topicPickerRow}>
                {["English", "French"].map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.topicButton, reviewLanguage === lang && styles.topicButtonActive]}
                    onPress={() => setReviewLanguage(lang as SpellingLanguage)}
                    disabled={isCreatingSpellingList}
                  >
                    <Text style={[styles.topicButtonText, reviewLanguage === lang && styles.topicButtonTextActive]}>
                      {lang}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Words ({extractedWords.length})</Text>
            </View>

            <ScrollView style={styles.photoReviewContent} keyboardShouldPersistTaps="handled">
              {extractedWords.map((word, idx) => (
                <View key={idx} style={styles.wordRow}>
                  <TextInput
                    style={styles.wordInput}
                    value={word}
                    onChangeText={(text) => {
                      const updated = [...extractedWords];
                      updated[idx] = text;
                      setExtractedWords(updated);
                    }}
                    editable={!isCreatingSpellingList}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setExtractedWords(extractedWords.filter((_, i) => i !== idx));
                    }}
                    disabled={isCreatingSpellingList}
                  >
                    <Text style={styles.removeButton}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={styles.photoReviewFooter}>
              <TouchableOpacity
                style={[styles.button, !isCreatingSpellingList && styles.buttonSecondary]}
                onPress={() => {
                  setShowPhotoReview(false);
                  setExtractedWords([]);
                  setReviewTitle("");
                  setReviewLanguage("English");
                }}
                disabled={isCreatingSpellingList}
              >
                <Text style={[styles.buttonText, styles.buttonSecondaryText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                onPress={handleSavePhotoList}
                disabled={isCreatingSpellingList}
              >
                {isCreatingSpellingList ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Save List</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <CameraCaptureModal
        visible={cameraVisible}
        onCaptured={(uri) => processCapturedImage(uri)}
        onClose={() => setCameraVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  childHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  childHeaderName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  gearButton: {
    padding: 8,
    width: 40,
  },
  errorText: {
    fontSize: 14,
    color: "#d32f2f",
    marginHorizontal: 16,
    marginVertical: 8,
    textAlign: "center",
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 60,
  },
  bigAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#2196f3",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  bigActionTextWrap: {
    flex: 1,
  },
  bigActionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  bigActionSub: {
    color: "#e3f2fd",
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    marginTop: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  homeworkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    borderRadius: 6,
    marginBottom: 10,
  },
  homeworkRowCompleted: {
    backgroundColor: "#f0f9f0",
    borderLeftColor: "#4caf50",
    opacity: 0.7,
  },
  homeworkInfo: {
    flex: 1,
  },
  homeworkTopic: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  homeworkDetails: {
    fontSize: 12,
    color: "#666",
  },
  completedDate: {
    fontSize: 11,
    color: "#4caf50",
    fontWeight: "600",
    marginTop: 4,
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  statusActive: {
    backgroundColor: "#e3f2fd",
  },
  statusCompleted: {
    backgroundColor: "#e8f5e9",
  },
  statusBadgeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2196f3",
  },
  statusBadgeTextCompleted: {
    color: "#4caf50",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffebee",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f44336",
  },
  deleteButtonText: {
    fontSize: 16,
    color: "#f44336",
    fontWeight: "700",
  },
  completedToggle: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f9f9f9",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    marginBottom: 8,
  },
  completedToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  emptyItemText: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 20,
    textAlign: "center",
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  topicPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  topicButton: {
    flex: 1,
    minWidth: 90,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  topicButtonActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  topicButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  topicButtonTextActive: {
    color: "#2196f3",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    justifyContent: "center",
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
  },
  counterButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2196f3",
  },
  counterValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    minWidth: 40,
    textAlign: "center",
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ddd",
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
  },
  modeButtonActive: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  modeButtonTextActive: {
    color: "#2196f3",
  },
  dateInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 20,
    color: "#333",
  },
  numberInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 6,
    color: "#333",
  },
  smallText: {
    fontSize: 12,
    color: "#999",
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonSecondary: {
    backgroundColor: "#f0f0f0",
    flex: 1,
  },
  buttonSecondaryText: {
    color: "#666",
  },
  buttonPrimary: {
    backgroundColor: "#2196f3",
    flex: 1,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalScrollContent: {
    paddingBottom: 300,
  },
  subjectPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    marginVertical: 12,
  },
  photoReviewContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  photoReviewHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  photoReviewContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  photoReviewFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  wordRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  wordInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#333",
  },
  removeButton: {
    fontSize: 18,
    color: "#d32f2f",
    fontWeight: "bold",
    paddingHorizontal: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    color: "#333",
  },
});
