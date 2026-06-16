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
import { AppLanguage, childLanguageForApp, getStoredAppLanguage } from "@/lib/appLanguage";
import { ensureParentProfile } from "@/lib/parentProfile";

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

const SUBJECTS = [
  { key: "multiplication", labels: { en: "Multiplication", fr: "Multiplication" } },
  { key: "division", labels: { en: "Division", fr: "Division" } },
  { key: "addition", labels: { en: "Addition", fr: "Addition" } },
  { key: "subtraction", labels: { en: "Subtraction", fr: "Soustraction" } },
  { key: "spelling", labels: { en: "Spelling", fr: "Orthographe" } },
  { key: "reading", labels: { en: "Reading", fr: "Lecture" } },
  { key: "conjugation", labels: { en: "Conjugation", fr: "Conjugaison" } },
];

const LANGUAGE_OPTIONS = [
  { value: "English", labels: { en: "English", fr: "Anglais" } },
  { value: "French", labels: { en: "French", fr: "Français" } },
];

const COPY: Record<AppLanguage, Record<string, string>> = {
  en: {
    addTitle: "Add child",
    editTitle: "Edit {name}'s settings",
    basicInfo: "Basic Information",
    skeelioTag: "Skeelio Tag",
    tagPlaceholder: "Real first name, nickname, or family tag",
    managePin: "Manage child's PIN",
    pinHelp: "PIN can be modified here later if forgotten. The child setup flow will let the child choose their own PIN.",
    pinPlaceholder: "4-6 digit PIN",
    languages: "Languages",
    schoolInfo: "School Information",
    schoolSystem: "School System",
    selectSchool: "Select school system",
    gradeLevel: "Grade Level",
    selectGrade: "Select grade level",
    selectSchoolFirst: "Select school system first",
    skillsTitle: "Skills to track",
    skillsHelp: "These are the skills that will be added to the parent dashboard for ongoing tracking. You can still assign specific practice later.",
    addButton: "Add Child",
    saveButton: "Save Settings",
    cancel: "Cancel",
    dangerZone: "Danger Zone",
    deleteChild: "Delete {name}",
    deleteTitle: "Delete Child",
    deleteConfirm: "Are you sure you want to delete {name}? This cannot be undone.",
    delete: "Delete",
    error: "Error",
    success: "Success",
    tagRequired: "Skeelio Tag is required",
    pinInvalid: "PIN must be 4-6 digits",
    userIdRequired: "User ID is required",
    signInAgain: "Please sign in again before adding a child.",
    profileFailed: "Couldn't prepare your parent account. Please try signing out and back in.",
    loadFailed: "Couldn't load child settings",
    saveFailed: "Couldn't save: {message}",
    childAdded: "Child added!",
    settingsSaved: "Settings saved!",
    childNotFound: "Child was not found or already deleted",
  },
  fr: {
    addTitle: "Ajouter un enfant",
    editTitle: "Modifier les réglages de {name}",
    basicInfo: "Informations de base",
    skeelioTag: "Skeelio Tag",
    tagPlaceholder: "Prénom, surnom ou repère familial",
    managePin: "Gérer le PIN de l'enfant",
    pinHelp: "Le PIN pourra être modifié ici plus tard s'il est oublié. Le parcours enfant permettra à l'enfant de choisir son propre PIN.",
    pinPlaceholder: "PIN de 4 à 6 chiffres",
    languages: "Langues",
    schoolInfo: "Informations scolaires",
    schoolSystem: "Système scolaire",
    selectSchool: "Sélectionner un système scolaire",
    gradeLevel: "Niveau",
    selectGrade: "Sélectionner un niveau",
    selectSchoolFirst: "Sélectionner d'abord un système scolaire",
    skillsTitle: "Compétences à suivre",
    skillsHelp: "Ces compétences seront ajoutées au tableau de bord parent pour un suivi continu. Vous pourrez toujours assigner des exercices précis plus tard.",
    addButton: "Ajouter l'enfant",
    saveButton: "Enregistrer",
    cancel: "Annuler",
    dangerZone: "Zone sensible",
    deleteChild: "Supprimer {name}",
    deleteTitle: "Supprimer l'enfant",
    deleteConfirm: "Voulez-vous vraiment supprimer {name} ? Cette action est définitive.",
    delete: "Supprimer",
    error: "Erreur",
    success: "Succès",
    tagRequired: "Le Skeelio Tag est obligatoire",
    pinInvalid: "Le PIN doit contenir 4 à 6 chiffres",
    userIdRequired: "Identifiant utilisateur requis",
    signInAgain: "Veuillez vous reconnecter avant d'ajouter un enfant.",
    profileFailed: "Impossible de préparer votre compte parent. Essayez de vous déconnecter puis de vous reconnecter.",
    loadFailed: "Impossible de charger les réglages de l'enfant",
    saveFailed: "Impossible d'enregistrer : {message}",
    childAdded: "Enfant ajouté !",
    settingsSaved: "Réglages enregistrés !",
    childNotFound: "L'enfant est introuvable ou a déjà été supprimé",
  },
};

interface ChildSettingsFormProps {
  childId?: string;
  isAddMode?: boolean;
  userId?: string;
  onSaved?: (result?: { childId: string; childName?: string }) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
}

export default function ChildSettingsForm({
  childId,
  isAddMode = false,
  userId,
  onSaved,
  onDeleted,
  onCancel,
}: ChildSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(!isAddMode);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [pin, setPin] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
  const [schoolSystem, setSchoolSystem] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [additionLevel, setAdditionLevel] = useState("not_started");
  const [subtractionLevel, setSubtractionLevel] = useState("not_started");
  const [multiplicationLevel, setMultiplicationLevel] = useState("not_started");
  const [divisionLevel, setDivisionLevel] = useState("not_started");
  const [focusSubjects, setFocusSubjects] = useState<string[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState("fox");
  const [openDropdown, setOpenDropdown] = useState<"school" | "grade" | null>(null);

  useEffect(() => {
    if (!isAddMode && childId) {
      fetchChild();
    }
  }, [childId, isAddMode]);

  useEffect(() => {
    let cancelled = false;

    const loadAppLanguage = async () => {
      const language = await getStoredAppLanguage(userId);
      if (cancelled) return;

      setAppLanguage(language);
      if (isAddMode) {
        setLanguages([childLanguageForApp(language)]);
      }
    };

    loadAppLanguage();

    return () => {
      cancelled = true;
    };
  }, [isAddMode, userId]);

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
      Alert.alert(COPY[appLanguage].error, COPY[appLanguage].loadFailed);
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
    setAdditionLevel(data.max_addition_number ? String(data.max_addition_number) : "not_started");
    setSubtractionLevel(data.math_subtraction_level ?? "not_started");
    setMultiplicationLevel(data.max_times_table ? String(data.max_times_table) : "not_started");
    setDivisionLevel(data.math_division_level ?? "not_started");
    setFocusSubjects(Array.isArray(data.focus_subjects) ? data.focus_subjects : []);
    setSelectedAvatar(data.selected_avatar ?? "fox");

    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(COPY[appLanguage].error, COPY[appLanguage].tagRequired);
      return;
    }

    if (!isAddMode && pin && (pin.length < 4 || pin.length > 6)) {
      Alert.alert(COPY[appLanguage].error, COPY[appLanguage].pinInvalid);
      return;
    }

    setIsSaving(true);

    const birthYearInt = birthYear ? parseInt(birthYear, 10) : null;
    const birthMonthInt = birthMonth ? parseInt(birthMonth, 10) : null;
    const birthDayInt = birthDay ? parseInt(birthDay, 10) : null;
    const age = birthYearInt ? new Date().getFullYear() - birthYearInt : null;

    const parsedAdditionValue = additionLevel === "1000_plus" ? 1000 : parseInt(additionLevel, 10);
    const additionValue = Number.isFinite(parsedAdditionValue) ? parsedAdditionValue : 10;
    const parsedMultiplicationValue = parseInt(multiplicationLevel, 10);
    const multiplicationValue = Number.isFinite(parsedMultiplicationValue) ? parsedMultiplicationValue : 0;
    const savedPin = isAddMode && !pin ? String(Math.floor(1000 + Math.random() * 9000)) : pin;

    const updateData: any = {
      name: name.trim(),
      pin: savedPin,
      languages,
      preferred_language: languages[0] || "English",
      school_system: schoolSystem,
      grade_level: gradeLevel,
      school_grade_level: null,
      max_addition_number: additionValue,
      math_subtraction_level: subtractionLevel || "not_started",
      max_times_table: multiplicationValue,
      math_division_level: divisionLevel || "not_started",
      focus_subjects: focusSubjects,
      child_goal: null,
      selected_avatar: selectedAvatar,
    };

    if (birthYearInt) updateData.birth_year = birthYearInt;
    if (birthMonthInt) updateData.birth_month = birthMonthInt;
    if (birthDayInt) updateData.birth_day = birthDayInt;
    if (age) updateData.age = age;

    let error;
    let savedChild: { childId: string; childName?: string } | undefined;

    if (isAddMode) {
      if (!userId) {
        Alert.alert(COPY[appLanguage].error, COPY[appLanguage].userIdRequired);
        setIsSaving(false);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        Alert.alert(COPY[appLanguage].error, COPY[appLanguage].signInAgain);
        setIsSaving(false);
        return;
      }

      const { error: profileError } = await ensureParentProfile(userData.user);
      if (profileError) {
        Alert.alert(COPY[appLanguage].error, COPY[appLanguage].profileFailed);
        setIsSaving(false);
        return;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("children")
        .insert({
          ...updateData,
          parent_id: userId,
        })
        .select();

      error = insertError;
      if (!error && insertedData && insertedData.length > 0) {
        const newChildId = insertedData[0].id;
        savedChild = { childId: newChildId, childName: name.trim() };
        console.log("[child-insert] inserted:", updateData);

        // Create rewards row for new child
        const { error: rewardsError } = await supabase.from("rewards").insert({
          child_id: newChildId,
          stars: 0,
          streak_days: 0,
        });

        if (rewardsError) {
          console.warn("[child-insert] rewards row creation failed:", rewardsError);
        }
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
      Alert.alert(COPY[appLanguage].error, COPY[appLanguage].saveFailed.replace("{message}", error.message));
      setIsSaving(false);
      return;
    }

    Alert.alert(COPY[appLanguage].success, isAddMode ? COPY[appLanguage].childAdded : COPY[appLanguage].settingsSaved);
    setIsSaving(false);
    onSaved?.(savedChild);
  };

  const handleDelete = () => {
    Alert.alert(COPY[appLanguage].deleteTitle, COPY[appLanguage].deleteConfirm.replace("{name}", name), [
      { text: COPY[appLanguage].cancel, onPress: () => {} },
      {
        text: COPY[appLanguage].delete,
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
            Alert.alert(COPY[appLanguage].error, COPY[appLanguage].saveFailed.replace("{message}", error.message));
            return;
          }

          if (!data || data.length === 0) {
            console.error("[child-delete] no rows deleted");
            Alert.alert(COPY[appLanguage].error, COPY[appLanguage].childNotFound);
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
  const copy = COPY[appLanguage];
  const schoolSystemLabel = schoolSystem ? SCHOOL_SYSTEMS[schoolSystem] : copy.selectSchool;
  const gradeLabel = gradeLevel || (schoolSystem ? copy.selectGrade : copy.selectSchoolFirst);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>
        {isAddMode ? copy.addTitle : copy.editTitle.replace("{name}", name)}
      </Text>

      {/* Basic Info */}
      <Text style={styles.sectionTitle}>{copy.basicInfo}</Text>

      <Text style={styles.label}>{copy.skeelioTag}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={copy.tagPlaceholder}
      />

      <Text style={styles.label}>{copy.managePin}</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {copy.pinHelp}
        </Text>
      </View>
      {!isAddMode && (
        <TextInput
          style={styles.input}
          value={pin}
          onChangeText={setPin}
          placeholder={copy.pinPlaceholder}
          keyboardType="number-pad"
          maxLength={6}
        />
      )}

      <Text style={styles.label}>{copy.languages}</Text>
      <View style={styles.optionRow}>
        {LANGUAGE_OPTIONS.map((lang) => (
          <TouchableOpacity
            key={lang.value}
            style={[styles.optionButton, (languages || []).includes(lang.value) && styles.optionButtonActive]}
            onPress={() =>
              setLanguages((prev) =>
                (prev || []).includes(lang.value) ? (prev || []).filter((l) => l !== lang.value) : [...(prev || []), lang.value]
              )
            }
          >
            <Text
              style={[styles.optionButtonText, (languages || []).includes(lang.value) && styles.optionButtonTextActive]}
            >
              {lang.labels[appLanguage]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* School Info */}
      <Text style={styles.sectionTitle}>{copy.schoolInfo}</Text>

      <Text style={styles.label}>{copy.schoolSystem}</Text>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setOpenDropdown(openDropdown === "school" ? null : "school")}
      >
        <Text style={styles.dropdownButtonText}>{schoolSystemLabel}</Text>
        <Text style={styles.dropdownChevron}>{openDropdown === "school" ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {openDropdown === "school" && (
        <View style={styles.dropdownMenu}>
          {Object.entries(SCHOOL_SYSTEMS).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={styles.dropdownItem}
              onPress={() => {
                setSchoolSystem(key);
                setGradeLevel("");
                setOpenDropdown(null);
              }}
            >
              <Text style={styles.dropdownItemText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>{copy.gradeLevel}</Text>
      <TouchableOpacity
        style={[styles.dropdownButton, !schoolSystem && styles.dropdownButtonDisabled]}
        onPress={() => schoolSystem && setOpenDropdown(openDropdown === "grade" ? null : "grade")}
        disabled={!schoolSystem}
      >
        <Text style={styles.dropdownButtonText}>{gradeLabel}</Text>
        <Text style={styles.dropdownChevron}>{openDropdown === "grade" ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {openDropdown === "grade" && (
        <View style={styles.dropdownMenu}>
          {(availableGrades || []).map((grade) => (
            <TouchableOpacity
              key={grade}
              style={styles.dropdownItem}
              onPress={() => {
                setGradeLevel(grade);
                setOpenDropdown(null);
              }}
            >
              <Text style={styles.dropdownItemText}>{grade}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Skills */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{copy.skillsTitle}</Text>
        <TouchableOpacity
          style={styles.infoIcon}
          onPress={() =>
            Alert.alert(
              copy.skillsTitle,
              copy.skillsHelp
            )
          }
        >
          <Text style={styles.infoIconText}>i</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.optionRow}>
        {SUBJECTS.map(({ key, labels }) => (
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
              {labels[appLanguage]}
            </Text>
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
          <Text style={styles.buttonText}>{isAddMode ? copy.addButton : copy.saveButton}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => onCancel?.()} disabled={isSaving}>
        <Text style={styles.cancelButtonText}>{copy.cancel}</Text>
      </TouchableOpacity>

      {/* Danger Zone (only in edit mode) */}
      {!isAddMode && (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>{copy.dangerZone}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>{copy.deleteChild.replace("{name}", name)}</Text>
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
    marginBottom: 20,
    color: "#1a1a1a",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  infoBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  infoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#e3f2fd",
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconText: {
    color: "#2196f3",
    fontWeight: "800",
    fontSize: 13,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  dropdownButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.7,
  },
  dropdownButtonText: {
    color: "#1f2933",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    paddingRight: 8,
  },
  dropdownChevron: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
  dropdownItemText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
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
  saveButton: {
    backgroundColor: "#0000ff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "700",
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
