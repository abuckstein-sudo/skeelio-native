import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "@/lib/supabase";

const SCHOOL_SYSTEMS: Record<string, string> = {
  france: "France",
  alberta: "Alberta",
  bc: "British Columbia",
  manitoba: "Manitoba",
  newfoundland: "Newfoundland and Labrador",
  nova_scotia: "Nova Scotia",
  ontario: "Ontario",
  pei: "Prince Edward Island",
  saskatchewan: "Saskatchewan",
  quebec: "Quebec",
  new_brunswick_ang: "New Brunswick (Anglophone)",
  new_brunswick_fr: "New Brunswick (Francophone)",
  nyc: "NYC Public Schools",
  la: "Los Angeles Unified",
  chicago: "Chicago Public Schools",
  miami: "Miami-Dade County Public Schools",
  clark: "Clark County School District",
};

const GRADES_BY_SYSTEM: Record<string, string[]> = {
  france: ["Grande Section", "CP", "CE1", "CE2", "CM1", "CM2"],
  quebec: ["Maternelle 5 ans", "1re année", "2e année", "3e année", "4e année", "5e année", "6e année", "Secondaire 1"],
  new_brunswick_fr: ["Maternelle", "1re année", "2e année", "3e année", "4e année", "5e année", "6e année", "7e année"],
  alberta: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  bc: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  manitoba: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  newfoundland: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  nova_scotia: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  ontario: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  pei: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  saskatchewan: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  new_brunswick_ang: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"],
  nyc: ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade", "7th Grade"],
  la: ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade", "7th Grade"],
  chicago: ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade", "7th Grade"],
  miami: ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade", "7th Grade"],
  clark: ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade", "6th Grade", "7th Grade"],
};

const ADDITION_OPTIONS = [
  { key: "not_started", label: "Not yet started" },
  { key: "10", label: "10" },
  { key: "100", label: "100" },
  { key: "1000_plus", label: "1000 and up" },
];

const SUBTRACTION_OPTIONS = [
  { key: "not_started", label: "Not yet started" },
  { key: "10", label: "10" },
  { key: "100", label: "100" },
  { key: "1000_plus", label: "1000 and up" },
];

const MULTIPLICATION_OPTIONS = [
  { key: "not_started", label: "Not yet started" },
  ...Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: `${i + 1}x table` })),
];

const DIVISION_OPTIONS = [
  { key: "not_started", label: "Not yet started" },
  { key: "simple", label: "Simple division" },
  { key: "long", label: "Long division" },
];

const MAIN_GOALS = [
  { key: "improve_current", label: "Improve current academic level" },
  { key: "meet_benchmark", label: "Achieve benchmarks for their age & school system" },
  { key: "surpass_benchmark", label: "Surpass benchmarks for their age & school system" },
];

const SUBJECTS = [
  { key: "multiplication", label: "Multiplication" },
  { key: "division", label: "Division" },
  { key: "addition", label: "Addition" },
  { key: "subtraction", label: "Subtraction" },
  { key: "spelling", label: "Spelling" },
  { key: "reading", label: "Reading" },
  { key: "conjugation", label: "Conjugation" },
];

const AVATARS = ["fox", "owl", "bear", "cat", "rabbit", "panda"];
const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

interface ChildSettingsFormProps {
  childId?: string;
  isAddMode?: boolean;
  userId?: string;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export default function ChildSettingsForm({
  childId,
  isAddMode = false,
  userId,
  onSaved,
  onDeleted,
}: ChildSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(!isAddMode);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [pin, setPin] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [schoolSystem, setSchoolSystem] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolGradeLevel, setSchoolGradeLevel] = useState("");
  const [additionLevel, setAdditionLevel] = useState("not_started");
  const [subtractionLevel, setSubtractionLevel] = useState("not_started");
  const [multiplicationLevel, setMultiplicationLevel] = useState("not_started");
  const [divisionLevel, setDivisionLevel] = useState("not_started");
  const [focusSubjects, setFocusSubjects] = useState<string[]>([]);
  const [mainGoal, setMainGoal] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("fox");

  useEffect(() => {
    if (!isAddMode && childId) {
      fetchChild();
    }
  }, [childId, isAddMode]);

  const fetchChild = async () => {
    if (!childId) {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("children")
      .select("*")
      .eq("id", childId)
      .single();

    if (error) {
      console.error("[settings] fetch error:", error);
      Alert.alert("Error", "Couldn't load child settings");
      setIsLoading(false);
      return;
    }

    if (!data) {
      setIsLoading(false);
      return;
    }

    console.log("[settings] child loaded:", childId);

    // Pre-fill form from child data (safely handle undefined fields)
    setName(data.name ?? "");
    setBirthYear(data.birth_year ? String(data.birth_year) : "");
    setBirthMonth(data.birth_month ? String(data.birth_month) : "");
    setBirthDay(data.birth_day ? String(data.birth_day) : "");
    setPin(data.pin ?? "");
    setLanguages(Array.isArray(data.languages) ? data.languages : ["English"]);
    setSchoolSystem(data.school_system ?? "");
    setGradeLevel(data.grade_level ?? "");
    setSchoolGradeLevel(data.school_grade_level ?? "");
    setAdditionLevel(data.max_addition_number ? String(data.max_addition_number) : "not_started");
    setSubtractionLevel(data.math_subtraction_level ?? "not_started");
    setMultiplicationLevel(data.max_times_table ? String(data.max_times_table) : "not_started");
    setDivisionLevel(data.math_division_level ?? "not_started");
    setFocusSubjects(Array.isArray(data.focus_subjects) ? data.focus_subjects : []);
    setMainGoal(data.child_goal ?? "");
    setSelectedAvatar(data.selected_avatar ?? "fox");

    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !pin) {
      Alert.alert("Error", "Name and PIN are required");
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      Alert.alert("Error", "PIN must be 4–6 digits");
      return;
    }

    setIsSaving(true);

    const birthYearInt = birthYear ? parseInt(birthYear, 10) : null;
    const birthMonthInt = birthMonth ? parseInt(birthMonth, 10) : null;
    const birthDayInt = birthDay ? parseInt(birthDay, 10) : null;
    const age = birthYearInt ? new Date().getFullYear() - birthYearInt : null;

    const additionValue = additionLevel === "not_started" ? null : (additionLevel === "1000_plus" ? 1000 : parseInt(additionLevel, 10));
    const multiplicationValue = multiplicationLevel === "not_started" ? null : parseInt(multiplicationLevel, 10);

    const updateData: any = {
      name: name.trim(),
      pin,
      languages,
      preferred_language: languages[0] || "English",
      school_system: schoolSystem,
      grade_level: gradeLevel,
      school_grade_level: schoolGradeLevel || null,
      max_addition_number: additionValue,
      math_subtraction_level: subtractionLevel,
      max_times_table: multiplicationValue,
      math_division_level: divisionLevel,
      focus_subjects: focusSubjects,
      child_goal: mainGoal,
      selected_avatar: selectedAvatar,
    };

    if (birthYearInt) updateData.birth_year = birthYearInt;
    if (birthMonthInt) updateData.birth_month = birthMonthInt;
    if (birthDayInt) updateData.birth_day = birthDayInt;
    if (age) updateData.age = age;

    let error;

    if (isAddMode) {
      if (!userId) {
        Alert.alert("Error", "User ID is required");
        setIsSaving(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("children")
        .insert({
          ...updateData,
          parent_id: userId,
        });

      error = insertError;
      if (!error) {
        console.log("[child-insert] inserted:", updateData);
      }
    } else {
      const { error: updateError } = await supabase
        .from("children")
        .update(updateData)
        .eq("id", childId);

      error = updateError;
      if (!error) {
        console.log("[settings-save] saved:", updateData);
      }
    }

    if (error) {
      console.error(isAddMode ? "[child-insert] error" : "[settings-save] error:", error);
      Alert.alert("Error", `Couldn't save: ${error.message}`);
      setIsSaving(false);
      return;
    }

    Alert.alert("Success", isAddMode ? "Child added!" : "Settings saved!");
    setIsSaving(false);
    onSaved?.();
  };

  const handleDelete = () => {
    Alert.alert("Delete Child", `Are you sure you want to delete ${name}? This cannot be undone.`, [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: async () => {
          console.log("[child-delete] attempting", { childId });

          const { data, error } = await supabase
            .from("children")
            .delete()
            .eq("id", childId)
            .select();

          console.log("[child-delete] result", { error, deletedCount: data?.length, deleted: data });

          if (error) {
            console.error("[child-delete] error:", error);
            Alert.alert("Error", `Couldn't delete: ${error.message}`);
            return;
          }

          if (!data || data.length === 0) {
            console.error("[child-delete] no rows deleted");
            Alert.alert("Error", "Child was not found or already deleted");
            return;
          }

          console.log("[child-delete] successfully deleted child");
          onDeleted?.();
        },
        style: "destructive",
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const availableGrades = schoolSystem && GRADES_BY_SYSTEM[schoolSystem] ? GRADES_BY_SYSTEM[schoolSystem] : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>{isAddMode ? "Add a Child" : `Edit ${name}'s Settings`}</Text>

      {/* Basic Info */}
      <Text style={styles.sectionTitle}>Basic Information</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" />

      <Text style={styles.label}>PIN (4–6 digits)</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="Enter PIN"
        keyboardType="number-pad"
        maxLength={6}
      />

      <Text style={styles.label}>Languages</Text>
      <View style={styles.optionRow}>
        {["English", "French"].map((lang) => (
          <TouchableOpacity
            key={lang}
            style={[styles.optionButton, (languages || []).includes(lang) && styles.optionButtonActive]}
            onPress={() =>
              setLanguages((prev) =>
                (prev || []).includes(lang) ? (prev || []).filter((l) => l !== lang) : [...(prev || []), lang]
              )
            }
          >
            <Text
              style={[styles.optionButtonText, (languages || []).includes(lang) && styles.optionButtonTextActive]}
            >
              {lang}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* School Info */}
      <Text style={styles.sectionTitle}>School Information</Text>

      <Text style={styles.label}>School System</Text>
      <View style={styles.pickerContainer}>
        {Object.entries(SCHOOL_SYSTEMS).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, schoolSystem === key && styles.optionButtonActive]}
            onPress={() => setSchoolSystem(key)}
          >
            <Text
              style={[
                styles.optionButtonText,
                schoolSystem === key && styles.optionButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Grade Level</Text>
      <View style={styles.pickerContainer}>
        {(availableGrades || []).map((grade) => (
          <TouchableOpacity
            key={grade}
            style={[styles.optionButton, gradeLevel === grade && styles.optionButtonActive]}
            onPress={() => setGradeLevel(grade)}
          >
            <Text
              style={[styles.optionButtonText, gradeLevel === grade && styles.optionButtonTextActive]}
            >
              {grade}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>School Level (if different)</Text>
      <TextInput
        style={styles.input}
        value={schoolGradeLevel}
        onChangeText={setSchoolGradeLevel}
        placeholder="Leave blank if same as grade level"
      />

      {/* Math Levels */}
      <Text style={styles.sectionTitle}>Math Skills</Text>

      <Text style={styles.label}>Addition up to</Text>
      <View style={styles.optionRow}>
        {ADDITION_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, additionLevel === key && styles.optionButtonActive]}
            onPress={() => setAdditionLevel(key)}
          >
            <Text
              style={[
                styles.optionButtonText,
                additionLevel === key && styles.optionButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Subtraction up to</Text>
      <View style={styles.optionRow}>
        {SUBTRACTION_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, subtractionLevel === key && styles.optionButtonActive]}
            onPress={() => setSubtractionLevel(key)}
          >
            <Text
              style={[
                styles.optionButtonText,
                subtractionLevel === key && styles.optionButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Multiplication</Text>
      <View style={styles.optionRow}>
        {MULTIPLICATION_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, multiplicationLevel === key && styles.optionButtonActive]}
            onPress={() => setMultiplicationLevel(key)}
          >
            <Text
              style={[
                styles.optionButtonText,
                multiplicationLevel === key && styles.optionButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Division</Text>
      <View style={styles.optionRow}>
        {DIVISION_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, divisionLevel === key && styles.optionButtonActive]}
            onPress={() => setDivisionLevel(key)}
          >
            <Text
              style={[styles.optionButtonText, divisionLevel === key && styles.optionButtonTextActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>Preferences</Text>

      <Text style={styles.label}>Subjects to Focus On</Text>
      <View style={styles.optionRow}>
        {SUBJECTS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, (focusSubjects || []).includes(key) && styles.optionButtonActive]}
            onPress={() =>
              setFocusSubjects((prev) =>
                (prev || []).includes(key) ? (prev || []).filter((s) => s !== key) : [...(prev || []), key]
              )
            }
          >
            <Text
              style={[
                styles.optionButtonText,
                (focusSubjects || []).includes(key) && styles.optionButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Main Goal</Text>
      <View style={styles.optionRow}>
        {MAIN_GOALS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.optionButton, mainGoal === key && styles.optionButtonActive]}
            onPress={() => setMainGoal(key)}
          >
            <Text
              style={[styles.optionButtonText, mainGoal === key && styles.optionButtonTextActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Avatar</Text>
      <View style={styles.avatarGrid}>
        {AVATARS.map((avatar) => (
          <TouchableOpacity
            key={avatar}
            style={[styles.avatarButton, selectedAvatar === avatar && styles.avatarButtonActive]}
            onPress={() => setSelectedAvatar(avatar)}
          >
            <Text style={styles.avatarEmoji}>{AVATAR_EMOJI[avatar]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isAddMode ? "Add Child" : "Save Settings"}</Text>
        )}
      </TouchableOpacity>

      {/* Danger Zone (only in edit mode) */}
      {!isAddMode && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete {name}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
    color: "#1a1a1a",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginTop: 20,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  optionButton: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionButtonActive: {
    backgroundColor: "#0000ff",
    borderColor: "#0000ff",
  },
  optionButtonText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  optionButtonTextActive: {
    color: "#fff",
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  avatarButton: {
    width: "23%",
    aspectRatio: 1,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButtonActive: {
    borderColor: "#0000ff",
    backgroundColor: "#f0f8ff",
  },
  avatarEmoji: {
    fontSize: 32,
  },
  saveButton: {
    backgroundColor: "#0000ff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  deleteButton: {
    backgroundColor: "#d32f2f",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  dangerZone: {
    backgroundColor: "#ffebee",
    borderLeftWidth: 4,
    borderLeftColor: "#d32f2f",
    padding: 16,
    borderRadius: 8,
    marginTop: 24,
  },
  dangerZoneTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#d32f2f",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
