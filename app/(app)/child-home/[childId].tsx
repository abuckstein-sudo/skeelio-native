import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Modal, TextInput, Image, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getOperationStatus, OperationStatus, getWordProblemsStatus, WordProblemsStatus } from "@/lib/tutor/status";
import { Operation } from "@/lib/tutorConfig";
import { listAssignmentsForChild, Assignment } from "@/lib/assignments";
import {
  listWorksheetSkillsForChild,
  worksheetSkillLabel,
  worksheetSkillProgressText,
  WorksheetSkill,
} from "@/lib/worksheetSkills";
import {
  listSchoolHomeworkWeek,
  schoolHomeworkDateLabel,
  schoolHomeworkShortDateLabel,
  SchoolHomeworkDay,
  SchoolHomeworkItem,
  SchoolHomeworkMaterial,
  setSchoolHomeworkItemDone,
  signedSchoolHomeworkImageUrl,
  todayDateKey,
  schoolHomeworkWeekDateKeys,
} from "@/lib/schoolHomework";
import { addHomeworkActiveSeconds, ChildHomeworkLimit, getChildHomeworkLimit } from "@/lib/homeworkTime";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GiraffeBackground from "@/components/GiraffeBackground";
import { appLanguageForChild } from "@/lib/appLanguage";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  selected_avatar?: string;
  home_background?: string;
  pin?: string;
  pin_setup_required?: boolean;
  intro_seen?: boolean;
  preferred_language?: string | null;
  languages?: string[] | null;
}

const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

interface SubjectTile {
  topic: string;
  label: string;
  description: string;
  isActive: boolean;
}

const SUBJECTS: SubjectTile[] = [
  { topic: "multiplication", label: "Multiplication", description: "Master times tables", isActive: true },
  { topic: "division", label: "Division", description: "Learn to divide numbers", isActive: true },
  { topic: "addition", label: "Addition", description: "Add numbers together", isActive: true },
  { topic: "subtraction", label: "Subtraction", description: "Take numbers away", isActive: true },
  { topic: "word_problems", label: "Word Problems", description: "Solve real-world math", isActive: true },
  { topic: "spelling", label: "Spelling", description: "Spell words correctly", isActive: true },
  { topic: "conjugation", label: "Conjugation", description: "Learn French verb forms", isActive: true },
  { topic: "reading", label: "Reading", description: "Read and understand", isActive: false },
];

const SUBJECT_COPY: Record<ChildHomeLanguage, Record<string, { label: string; description: string }>> = {
  en: Object.fromEntries(SUBJECTS.map((subject) => [subject.topic, { label: subject.label, description: subject.description }])),
  fr: {
    multiplication: { label: "Multiplication", description: "Maîtrise les tables" },
    division: { label: "Division", description: "Apprends à diviser" },
    addition: { label: "Addition", description: "Additionne les nombres" },
    subtraction: { label: "Soustraction", description: "Retire des nombres" },
    word_problems: { label: "Problèmes", description: "Résous des situations" },
    spelling: { label: "Orthographe", description: "Écris les mots correctement" },
    conjugation: { label: "Conjugaison", description: "Travaille les verbes" },
    reading: { label: "Lecture", description: "Lis et comprends" },
  },
};

const AVATAR_OPTIONS = ["cat", "owl", "fox", "bear", "rabbit", "panda"];
const BACKGROUND_OPTIONS = [
  { id: "giraffe", label: "Giraffe", color: null },
  { id: "blue", label: "Blue", color: "#6FB0E0" },
  { id: "red", label: "Red", color: "#E8857E" },
  { id: "green", label: "Green", color: "#6FC089" },
] as const;

type ChildHomeLanguage = "en" | "fr";

const SETUP_COPY = {
  en: {
    pinTitle: "Create your PIN",
    pinBody: "You will use this PIN when you come back to Skeelio.",
    pinPlaceholder: "4-6 numbers",
    pinConfirmPlaceholder: "Confirm PIN",
    pinInvalid: "Use 4 to 6 numbers",
    pinMismatch: "The two PINs need to match",
    pinSaveError: "Could not save PIN",
    pinSaveButton: "Save PIN",
    avatarRequired: "Pick an avatar first",
    backgroundRequired: "Pick a background first",
    finishError: "Could not finish setup",
    back: "Back",
    next: "Next",
    start: "Start",
    homework: "Homework",
    homeworkBody: "Do assigned work first",
    greetingReady: "Let's get started!",
    greetingChoice: "What would you like to work on today?",
    completed: "Finished today",
    freePlay: "Free play",
    freePlayBody: "Choose practice tiles",
    settings: "Settings",
    pickAvatar: "Pick Your Avatar",
    pickBackground: "Pick Your Background",
    backgroundLabels: {
      giraffe: "Giraffe",
      blue: "Blue",
      red: "Red",
      green: "Green",
    },
    introSlides: [
      {
        key: "avatar",
        icon: "account-star",
        title: "Choose your avatar",
        body: "Pick the character you want to see when you come here.",
      },
      {
        key: "background",
        icon: "palette",
        title: "Choose your background",
        body: "Pick the colour or scene that makes this page feel like yours.",
      },
      {
        key: "work",
        icon: "clipboard-check",
        title: "Do homework or free play",
        body: "If an assignment is waiting, start there. If not, choose any practice tile.",
      },
      {
        key: "stars",
        icon: "star",
        title: "Earn stars",
        body: "Practise, finish work, and collect stars for the shop.",
      },
    ],
  },
  fr: {
    pinTitle: "Crée ton PIN",
    pinBody: "Tu utiliseras ce PIN pour revenir dans Skeelio.",
    pinPlaceholder: "4 à 6 chiffres",
    pinConfirmPlaceholder: "Confirme le PIN",
    pinInvalid: "Utilise 4 à 6 chiffres",
    pinMismatch: "Les deux PIN doivent être identiques",
    pinSaveError: "Impossible d'enregistrer le PIN",
    pinSaveButton: "Enregistrer le PIN",
    avatarRequired: "Choisis d'abord un avatar",
    backgroundRequired: "Choisis d'abord un fond",
    finishError: "Impossible de terminer la configuration",
    back: "Retour",
    next: "Suivant",
    start: "Commencer",
    homework: "Devoirs",
    homeworkBody: "Fais d'abord le travail assigné",
    greetingReady: "On commence !",
    greetingChoice: "Que veux-tu travailler aujourd'hui ?",
    completed: "Terminé aujourd'hui",
    freePlay: "Jeu libre",
    freePlayBody: "Choisis une activité",
    settings: "Réglages",
    pickAvatar: "Choisis ton avatar",
    pickBackground: "Choisis ton fond",
    backgroundLabels: {
      giraffe: "Girafe",
      blue: "Bleu",
      red: "Rouge",
      green: "Vert",
    },
    introSlides: [
      {
        key: "avatar",
        icon: "account-star",
        title: "Choisis ton avatar",
        body: "Choisis le personnage que tu veux voir ici.",
      },
      {
        key: "background",
        icon: "palette",
        title: "Choisis ton fond",
        body: "Choisis la couleur ou le décor qui rend cette page à toi.",
      },
      {
        key: "work",
        icon: "clipboard-check",
        title: "Devoirs ou jeu libre",
        body: "S'il y a un devoir, commence par là. Sinon, choisis une activité.",
      },
      {
        key: "stars",
        icon: "star",
        title: "Gagne des étoiles",
        body: "Entraîne-toi, termine ton travail et gagne des étoiles pour la boutique.",
      },
    ],
  },
} as const;

const getChildHomeLanguage = (child: Child | null): ChildHomeLanguage => {
  return appLanguageForChild(child);
};

const wasCompletedToday = (completedAt?: string | null) => {
  if (!completedAt) return false;
  const completed = new Date(completedAt);
  const now = new Date();
  return (
    completed.getFullYear() === now.getFullYear() &&
    completed.getMonth() === now.getMonth() &&
    completed.getDate() === now.getDate()
  );
};

export default function ChildHomeScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [stars, setStars] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [operationStatuses, setOperationStatuses] = useState<Record<Operation, OperationStatus>>(
    {} as Record<Operation, OperationStatus>
  );
  const [wordProblemsStatus, setWordProblemsStatus] = useState<WordProblemsStatus | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);
  const [completedAssignments, setCompletedAssignments] = useState<Assignment[]>([]);
  const [pendingEpisodes, setPendingEpisodes] = useState<any[]>([]);
  const [completedWorksheetSkills, setCompletedWorksheetSkills] = useState<WorksheetSkill[]>([]);
  const [schoolHomeworkWeekDays, setSchoolHomeworkWeekDays] = useState<(SchoolHomeworkDay | null)[]>([]);
  const [expandedHomeworkDate, setExpandedHomeworkDate] = useState(todayDateKey());
  const [homeworkLimit, setHomeworkLimit] = useState<ChildHomeworkLimit | null>(null);
  const [homeworkTimerSeconds, setHomeworkTimerSeconds] = useState(0);
  const [limitWarningShown, setLimitWarningShown] = useState(false);
  const [isChildHomeFocused, setIsChildHomeFocused] = useState(true);
  const [materialModalVisible, setMaterialModalVisible] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<SchoolHomeworkMaterial | null>(null);
  const [activeMaterialUrl, setActiveMaterialUrl] = useState<string | null>(null);
  const [activeMaterialTitle, setActiveMaterialTitle] = useState("");
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSetupError, setPinSetupError] = useState("");
  const [introSlideIndex, setIntroSlideIndex] = useState(0);
  const [introError, setIntroError] = useState("");
  const skipNextFocusFeedRefreshRef = useRef(false);

  const fetchStars = useCallback(async () => {
    if (!childId) return;

    console.log("[child-home] re-fetching stars on focus");
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", childId)
      .maybeSingle();

    console.log("[child-home] stars fetched:", rewardsData?.stars ?? 0);
    setStars(rewardsData?.stars ?? 0);
  }, [childId]);

  const fetchPendingAssignments = useCallback(async () => {
    if (!childId) return;
    const assignments = await listAssignmentsForChild(childId);
    const pending = assignments.filter((a) => a.status === "pending");
  const completed = assignments
      .filter((a) => a.status === "complete" && wasCompletedToday(a.completed_at))
      .sort((a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);
    setPendingAssignments(pending);
    setCompletedAssignments(completed);

  }, [childId]);

  const fetchPendingEpisodes = useCallback(async () => {
    if (!childId) return;
    try {
      const { data, error: dbError } = await supabase
        .from("tutor_episodes")
        .select("id, concept, lesson, domain, language, grade_band, created_at, status")
        .eq("child_id", childId)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: true });

      if (dbError) {
        console.error("[child-home] failed to fetch pending episodes:", dbError);
        setPendingEpisodes([]);
      } else {
        setPendingEpisodes(data || []);
      }
    } catch (err) {
      console.error("[child-home] failed to fetch pending episodes:", err);
      setPendingEpisodes([]);
    }
  }, [childId]);

  const fetchCompletedWorksheetSkills = useCallback(async () => {
    if (!childId) return;
    const skills = await listWorksheetSkillsForChild(childId);
    setCompletedWorksheetSkills(
      skills
        .filter((skill) => skill.status === "complete")
        .sort((a, b) => {
          const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 5)
    );
  }, [childId]);

  const fetchSchoolHomework = useCallback(async () => {
    if (!childId) return;
    const [days, limit] = await Promise.all([
      listSchoolHomeworkWeek(childId),
      getChildHomeworkLimit(childId),
    ]);
    setSchoolHomeworkWeekDays(days);
    setHomeworkLimit(limit);
    const today = days.find((day) => day?.homework_date === todayDateKey());
    setHomeworkTimerSeconds(today?.total_active_seconds || 0);
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      setIsChildHomeFocused(true);
      return () => setIsChildHomeFocused(false);
    }, [])
  );

  useEffect(() => {
    const today = schoolHomeworkWeekDays.find((day) => day?.homework_date === todayDateKey());
    const items = today?.school_homework_items || [];
    const limitMinutes = homeworkLimit?.daily_limit_minutes;
    const unlockedToday = homeworkLimit?.unlocked_date === todayDateKey();
    if (!isChildHomeFocused || !today?.id || items.length === 0 || !limitMinutes || unlockedToday) return;

    const limitSeconds = limitMinutes * 60;
    if (homeworkTimerSeconds >= limitSeconds) {
      Alert.alert(
        "You have done a lot of work today!",
        "Go play or let your adult know you need more time."
      );
      router.replace("/children");
      return;
    }

    let pendingSeconds = 0;
    const timer = setInterval(() => {
      pendingSeconds += 5;
      setHomeworkTimerSeconds((current) => {
        const next = current + 5;
        if (!limitWarningShown && next >= Math.max(0, limitSeconds - 120) && next < limitSeconds) {
          setLimitWarningShown(true);
          Alert.alert("Almost time for a break", "You have a little homework time left. Finish the item you are on.");
        }
        if (next >= limitSeconds) {
          void addHomeworkActiveSeconds(today.id, pendingSeconds).finally(() => {
            Alert.alert(
              "You have done a lot of work today!",
              "Go play or let your adult know you need more time."
            );
            router.replace("/children");
          });
          clearInterval(timer);
        }
        return Math.min(next, limitSeconds);
      });
    }, 5000);

    const syncTimer = setInterval(() => {
      if (pendingSeconds > 0) {
        const seconds = pendingSeconds;
        pendingSeconds = 0;
        void addHomeworkActiveSeconds(today.id, seconds);
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(syncTimer);
      if (pendingSeconds > 0) {
        void addHomeworkActiveSeconds(today.id, pendingSeconds);
      }
    };
  }, [schoolHomeworkWeekDays, homeworkLimit, homeworkTimerSeconds, limitWarningShown, router, isChildHomeFocused]);

  const refreshHomeworkFeed = useCallback(async () => {
    await Promise.all([
      fetchPendingAssignments(),
      fetchPendingEpisodes(),
      fetchCompletedWorksheetSkills(),
      fetchSchoolHomework(),
    ]);
  }, [fetchPendingAssignments, fetchPendingEpisodes, fetchCompletedWorksheetSkills, fetchSchoolHomework]);

  useEffect(() => {
    if (childId) {
      skipNextFocusFeedRefreshRef.current = true;
      fetchChild();
      refreshHomeworkFeed();
    }
  }, [childId, refreshHomeworkFeed]);

  // Re-fetch stars, assignments, and episodes when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchStars();
      if (skipNextFocusFeedRefreshRef.current) {
        skipNextFocusFeedRefreshRef.current = false;
        return;
      }
      refreshHomeworkFeed();
    }, [fetchStars, refreshHomeworkFeed])
  );

  const fetchChild = async () => {
    if (!childId) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, selected_avatar, home_background, pin, pin_setup_required, intro_seen, preferred_language, languages, max_addition_number, max_times_table, math_subtraction_level, math_division_level")
      .eq("id", childId)
      .single();

    if (dbError) {
      console.log("[child-home] fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    console.log("[child-home] child loaded:", childId);
    setChild(data as Child);

    // Fetch rewards (stars)
    const { data: rewardsData } = await supabase
      .from("rewards")
      .select("stars")
      .eq("child_id", childId)
      .maybeSingle();

    setStars(rewardsData?.stars ?? 0);

    // Fetch tier-based operation statuses
    const mathOperations: Operation[] = ["addition", "subtraction", "multiplication", "division"];
    const statuses: Record<Operation, OperationStatus> = {} as any;
    for (const op of mathOperations) {
      const status = await getOperationStatus(childId, op, data || {});
      statuses[op] = status;
    }
    setOperationStatuses(statuses);

    // Fetch word problems status
    const wpStatus = await getWordProblemsStatus(childId, data || {});
    setWordProblemsStatus(wpStatus);

    setIsLoading(false);
  };

  const handleSubjectTap = async (topic: string) => {
    if (childId) {
      console.log("[child-home] topic selected:", topic);
      if (topic === "word_problems") {
        router.push({
          pathname: "/word-problems/[childId]",
          params: { childId },
        });
      } else if (topic === "spelling") {
        router.push({
          pathname: "/spelling-lists/[childId]",
          params: { childId },
        });
      } else if (topic === "conjugation") {
        // Create a new conjugation session
        try {
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData.user?.id;
          if (!userId) return;

          // Fetch child grade level
          const { data: childData, error: childErr } = await supabase
            .from("children")
            .select("grade_level")
            .eq("id", childId)
            .single();

          if (childErr) throw childErr;
          const gradeLevel = childData?.grade_level || "CE1";

          // Fetch pool first to ensure questions are available
          const { fetchConjugationPool, createConjugationSession } = await import("@/lib/conjugation");
          const pool = await fetchConjugationPool(childId, gradeLevel);

          if (pool.length === 0) {
            alert("No conjugation questions available for this grade level");
            return;
          }

          // Only create session if pool is non-empty
          const session = await createConjugationSession(childId, userId, Math.min(10, pool.length));

          router.push({
            pathname: "/conjugation/[sessionId]",
            params: { sessionId: session.id, childId },
          });
        } catch (err) {
          console.error("[child-home] failed to create conjugation session:", err);
          alert("Failed to start conjugation session");
        }
      } else {
        router.push({
          pathname: "/practice",
          params: { topic, childId },
        });
      }
    }
  };

  const handleHomeworkTap = async (assignmentId: string) => {
    console.log("[child-home] homework assignment selected:", assignmentId);

    // Find the assignment to check its type
    const assignment = pendingAssignments.find((a) => a.id === assignmentId);

    if (assignment?.subject === "spelling") {
      // Route to spelling session with assignmentId and mode
      const listId = (assignment.custom_questions as any)?.list_id;
      const mode = assignment.mode || "practice";
      router.push({
        pathname: "/spelling/[listId]",
        params: { listId, childId, assignmentId, mode },
      });
    } else if (assignment?.subject === "conjugation") {
      // Create conjugation session for homework
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) return;

        const { createConjugationSession } = await import("@/lib/conjugation");
        const session = await createConjugationSession(childId, userId, assignment.question_count || 10);

        router.push({
          pathname: "/conjugation/[sessionId]",
          params: { sessionId: session.id, childId, assignmentId },
        });
      } catch (err) {
        console.error("[child-home] failed to create conjugation homework session:", err);
        alert("Failed to start conjugation homework");
      }
    } else {
      // Route to homework for math assignments
      router.push({
        pathname: "/homework/[assignmentId]",
        params: { assignmentId, childId },
      });
    }
  };

  const handleShopPress = () => {
    router.push({
      pathname: "/star-shop/[childId]",
      params: { childId },
    });
  };

  const handleEpisodeTap = (episode: any) => {
    console.log("[child-home] episode selected:", episode.id);

    const episodeData = JSON.stringify({
      concept: episode.concept,
      lesson: episode.lesson,
      grade_band: episode.grade_band || "",
      language: episode.language,
      domain: episode.domain,
    });

    router.push({
      pathname: "/(app)/episode",
      params: {
        data: episodeData,
        episodeId: episode.id,
        childId: childId,
      },
    });
  };

  const handleSchoolHomeworkItemPress = async (item: SchoolHomeworkItem) => {
    if (item.linked_assignment_id) {
      router.push({
        pathname: "/homework/[assignmentId]",
        params: { assignmentId: item.linked_assignment_id, childId },
      });
      return;
    }

    if (item.linked_spelling_list_id) {
      router.push({
        pathname: "/spelling/[listId]",
        params: { listId: item.linked_spelling_list_id, childId, mode: "practice" },
      });
      return;
    }

    const material = (item.school_homework_materials || [])[0];
    if (material) {
      setActiveMaterial(material);
      setActiveMaterialTitle(material.title || item.task_text);
      setActiveMaterialUrl(null);
      setMaterialModalVisible(true);
      if (material.material_type === "image") {
        const url = await signedSchoolHomeworkImageUrl(material);
        setActiveMaterialUrl(url);
      }
    }
  };

  const handleSchoolHomeworkToggle = async (item: SchoolHomeworkItem) => {
    try {
      await setSchoolHomeworkItemDone(item, item.status !== "done", "child");
      await fetchSchoolHomework();
    } catch (err) {
      console.error("[child-home] school homework toggle error:", err);
      alert("Could not update homework");
    }
  };

  const handleAvatarSelect = async (avatarId: string) => {
    if (!child) return;
    try {
      const { error: updateError } = await supabase
        .from("children")
        .update({ selected_avatar: avatarId })
        .eq("id", childId);
      if (updateError) throw updateError;
      setChild({ ...child, selected_avatar: avatarId });
      setIntroError("");
      console.log("[child-home] avatar updated:", avatarId);
    } catch (err) {
      console.error("[child-home] failed to update avatar:", err);
    }
  };

  const handleBackgroundSelect = async (bgId: string) => {
    if (!child) return;
    try {
      const { error: updateError } = await supabase
        .from("children")
        .update({ home_background: bgId })
        .eq("id", childId);
      if (updateError) throw updateError;
      setChild({ ...child, home_background: bgId });
      setIntroError("");
      console.log("[child-home] background updated:", bgId);
    } catch (err) {
      console.error("[child-home] failed to update background:", err);
    }
  };

  const handleAllDone = () => {
    console.log("[child-home] back to hub");
    router.push("/children");
  };

  const handlePinSetupSubmit = async () => {
    const copy = SETUP_COPY[getChildHomeLanguage(child)];
    const pin = newPin.trim();
    const confirmation = confirmPin.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      setPinSetupError(copy.pinInvalid);
      return;
    }

    if (pin !== confirmation) {
      setPinSetupError(copy.pinMismatch);
      setConfirmPin("");
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("children")
        .update({ pin, pin_setup_required: false })
        .eq("id", childId);
      if (updateError) throw updateError;

      setChild((current) =>
        current ? { ...current, pin, pin_setup_required: false } : current
      );
      setNewPin("");
      setConfirmPin("");
      setPinSetupError("");
    } catch (err: any) {
      console.error("[child-home] failed to set child PIN:", err);
      setPinSetupError(err?.message || copy.pinSaveError);
    }
  };

  const handleIntroNext = async () => {
    if (!child) return;
    const copy = SETUP_COPY[getChildHomeLanguage(child)];

    const isAvatarSlide = copy.introSlides[introSlideIndex].key === "avatar";
    const isBackgroundSlide = copy.introSlides[introSlideIndex].key === "background";

    if (isAvatarSlide && !child.selected_avatar) {
      setIntroError(copy.avatarRequired);
      return;
    }

    if (isBackgroundSlide && !child.home_background) {
      setIntroError(copy.backgroundRequired);
      return;
    }

    setIntroError("");

    if (introSlideIndex < copy.introSlides.length - 1) {
      setIntroSlideIndex((current) => current + 1);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("children")
        .update({ intro_seen: true })
        .eq("id", childId);
      if (updateError) throw updateError;

      setChild({ ...child, intro_seen: true });
      setIntroSlideIndex(0);
    } catch (err: any) {
      console.error("[child-home] failed to save intro state:", err);
      setIntroError(err?.message || copy.finishError);
    }
  };

  const handleIntroBack = () => {
    setIntroError("");
    setIntroSlideIndex((current) => Math.max(0, current - 1));
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!child || error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Oops!</Text>
        <Text style={styles.errorText}>{error || "Child not found"}</Text>
        <TouchableOpacity style={styles.button} onPress={handleAllDone}>
          <Text style={styles.buttonText}>Back to Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const backgroundKey = child?.home_background || "giraffe";
  const bgOption = BACKGROUND_OPTIONS.find((bg) => bg.id === backgroundKey);
  const schoolWeekDateKeys = schoolHomeworkWeekDateKeys();
  const schoolHomeworkByDate = new Map(schoolHomeworkWeekDays.map((day) => [day?.homework_date, day]));

  // One unified "Homework" feed: worksheet practice sessions (episodes) +
  // assigned work, ordered by when they were created/assigned.
  const schoolLinkedAssignmentIds = new Set(
    schoolHomeworkWeekDays
      .flatMap((day) => day?.school_homework_items || [])
      .map((item) => item.linked_assignment_id)
      .filter(Boolean)
  );

  const homeworkFeed = [
    ...pendingEpisodes.map((e) => ({
      type: "episode" as const,
      id: e.id as string,
      createdAt: (e.created_at as string) || "",
      title: e.concept?.label || "Practice",
      subtitle: e.status === "in_progress" ? "Reprendre" : "À faire",
      episode: e,
    })),
    ...pendingAssignments.filter((a) => !schoolLinkedAssignmentIds.has(a.id)).map((a) => {
      const isSpelling = a.subject === "spelling";
      const base = (a.focus || a.subject || "Practice") as string;
      const title = isSpelling
        ? `Spelling: ${(a.custom_questions as any)?.title || "Spelling List"}`
        : base.charAt(0).toUpperCase() + base.slice(1);
      const count = a.question_count;
      return {
        type: "assignment" as const,
        id: a.id as string,
        createdAt: ((a as any).created_at as string) || "",
        title,
        subtitle: `${count} ${isSpelling ? "word" : "question"}${count !== 1 ? "s" : ""}`,
        episode: null as any,
      };
    }),
  ].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));

  const completedHomeworkFeed = [
    ...completedWorksheetSkills.map((skill) => ({
      type: "worksheet" as const,
      id: skill.id,
      title: worksheetSkillLabel(skill),
      completedAt: skill.completed_at,
      subtitle: worksheetSkillProgressText(skill),
    })),
    ...completedAssignments.map((a) => {
      const isSpelling = a.subject === "spelling";
      const base = (a.focus || a.subject || "Practice") as string;
      const title = isSpelling
        ? `Spelling: ${(a.custom_questions as any)?.title || "Spelling List"}`
        : base.charAt(0).toUpperCase() + base.slice(1);
      return {
        id: a.id,
        title,
        completedAt: a.completed_at,
        subtitle: typeof a.correct_count === "number"
          ? `Score: ${a.correct_count}/${a.question_count}`
          : `${a.question_count} ${isSpelling ? "word" : "question"}${a.question_count !== 1 ? "s" : ""}`,
      };
    }),
  ].sort((a, b) => {
    const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return dateB - dateA;
  }).slice(0, 5);

  const setupCopy = SETUP_COPY[getChildHomeLanguage(child)];
  const childLanguage = getChildHomeLanguage(child);
  const introSlides = setupCopy.introSlides;
  const currentIntroSlide = introSlides[introSlideIndex];
  const introVisible = !!child && !child.pin_setup_required && !child.intro_seen;
  const pinSetupVisible = !!child?.pin_setup_required;
  const renderAvatarChoices = () => (
    <View style={styles.avatarGrid}>
      {AVATAR_OPTIONS.map((avatar) => (
        <TouchableOpacity
          key={avatar}
          style={[
            styles.avatarOption,
            child?.selected_avatar === avatar && styles.avatarOptionSelected,
          ]}
          onPress={() => handleAvatarSelect(avatar)}
        >
          <Text style={styles.avatarOptionEmoji}>
            {AVATAR_EMOJI[avatar] || AVATAR_EMOJI.fox}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  const renderBackgroundChoices = () => (
    <View style={styles.backgroundGrid}>
      {BACKGROUND_OPTIONS.map((bg) => (
        <TouchableOpacity
          key={bg.id}
          style={[
            styles.backgroundOption,
            bg.color ? { backgroundColor: bg.color } : {},
            child?.home_background === bg.id && styles.backgroundOptionSelected,
          ]}
          onPress={() => handleBackgroundSelect(bg.id)}
        >
          {bg.id === "giraffe" ? (
            <View style={styles.giraffePreview} />
          ) : null}
          <Text style={styles.backgroundLabel}>{setupCopy.backgroundLabels[bg.id]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Background */}
      {backgroundKey === "giraffe" ? (
        <GiraffeBackground />
      ) : (
        <View style={[styles.solidBackground, { backgroundColor: bgOption?.color || "#fff" }]} />
      )}

      <ScrollView contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftCluster}>
          <TouchableOpacity onPress={handleAllDone} style={styles.allDoneButton}>
            <Text style={styles.allDoneText}>{getChildHomeLanguage(child) === "fr" ? "Terminé" : "All done"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSettingsModalVisible(true)}>
            <MaterialCommunityIcons name="cog" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.topRightCluster}>
          <Text style={styles.starsText}>⭐ {stars}</Text>
          <TouchableOpacity onPress={handleShopPress} style={styles.shopButton}>
            <Text style={styles.shopIcon}>🛒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Greeting */}
      <View style={styles.greetingBanner}>
        {child.selected_avatar && (
          <Text style={styles.avatarEmoji}>
            {AVATAR_EMOJI[child.selected_avatar] || AVATAR_EMOJI.fox}
          </Text>
        )}
        <Text style={styles.greetingText}>
          {getChildHomeLanguage(child) === "fr" ? `Salut ${child.name} ! ` : `Hi ${child.name}! `}
          {pendingAssignments.length > 0 || pendingEpisodes.length > 0 ? setupCopy.greetingReady : setupCopy.greetingChoice}
        </Text>
      </View>

      {schoolWeekDateKeys.length > 0 && (
        <View style={styles.schoolHomeworkSection}>
          {schoolWeekDateKeys.map((dateKey) => {
            const day = schoolHomeworkByDate.get(dateKey) || null;
            const items = day?.school_homework_items || [];
            const doneCount = items.filter((item) => item.status === "done").length;
            const expanded = expandedHomeworkDate === dateKey;
            return (
              <View key={dateKey} style={styles.schoolHomeworkDayGroup}>
                <TouchableOpacity
                  style={styles.schoolHomeworkDayHeader}
                  onPress={() => setExpandedHomeworkDate(expanded ? "" : dateKey)}
                >
                  <Text style={styles.schoolHomeworkDate}>
                    {expanded ? schoolHomeworkDateLabel(dateKey, childLanguage) : schoolHomeworkShortDateLabel(dateKey, childLanguage)}
                  </Text>
                  <View style={styles.schoolHomeworkDayStatus}>
                    <Text style={styles.schoolHomeworkDayCount}>{doneCount}/{items.length}</Text>
                    <MaterialCommunityIcons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#78909c"
                    />
                  </View>
                </TouchableOpacity>
                {expanded && items.length === 0 && (
                  <Text style={styles.schoolHomeworkEmpty}>
                    {childLanguage === "fr" ? "Pas de devoirs enregistrés" : "No homework saved"}
                  </Text>
                )}
                {expanded && items.map((item) => {
            const done = item.status === "done";
            const linked = !!item.linked_assignment_id || !!item.linked_spelling_list_id;
            const hasMaterial = (item.school_homework_materials || []).length > 0;
            const needsMaterial = Boolean((item.metadata as any)?.needs_material) && !hasMaterial;
            const canOpen = linked || hasMaterial;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.schoolHomeworkItem, done && styles.schoolHomeworkItemDone]}
                activeOpacity={0.8}
                onPress={() => void handleSchoolHomeworkItemPress(item)}
                disabled={!canOpen}
              >
                <TouchableOpacity
                  style={styles.schoolHomeworkCheck}
                  onPress={() => void handleSchoolHomeworkToggle(item)}
                  disabled={item.status === "waiting_parent"}
                >
                  <MaterialCommunityIcons
                    name={done ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                    size={26}
                    color={done ? "#4caf50" : item.status === "waiting_parent" ? "#b0bec5" : "#78909c"}
                  />
                </TouchableOpacity>
                <View style={styles.schoolHomeworkTextWrap}>
                  <Text style={[styles.schoolHomeworkText, done && styles.schoolHomeworkTextDone]}>
                    {item.task_text}
                  </Text>
                  <Text style={styles.schoolHomeworkMeta}>
                    {item.status === "waiting_parent"
                      ? childLanguage === "fr" ? "à faire signer" : "waiting for parent"
                      : linked
                        ? childLanguage === "fr" ? "appuie pour pratiquer" : "tap to practice"
                        : hasMaterial
                          ? childLanguage === "fr" ? "appuie pour ouvrir" : "tap to open"
                          : needsMaterial
                            ? childLanguage === "fr" ? "un adulte doit ajouter le document" : "needs a document from an adult"
                            : item.task_kind}
                  </Text>
                </View>
                {canOpen && (
                  <MaterialCommunityIcons name={hasMaterial && !linked ? "file-document-outline" : "chevron-right"} size={22} color="#90a4ae" />
                )}
              </TouchableOpacity>
            );
                })}
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={materialModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMaterialModalVisible(false)}
      >
        <View style={styles.materialModalBackdrop}>
          <View style={[styles.materialModal, activeMaterial?.material_type === "image" && styles.materialModalImageFullscreen]}>
            <View style={styles.materialModalHeader}>
              <Text style={styles.materialModalTitle}>{activeMaterialTitle}</Text>
              <TouchableOpacity onPress={() => setMaterialModalVisible(false)} style={styles.materialCloseButton}>
                <MaterialCommunityIcons name="close" size={22} color="#455a64" />
              </TouchableOpacity>
            </View>
            {activeMaterial?.material_type === "image" ? (
              activeMaterialUrl ? (
                <ScrollView
                  style={styles.materialImageZoom}
                  contentContainerStyle={styles.materialImageZoomContent}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  centerContent
                >
                  <Image source={{ uri: activeMaterialUrl }} style={styles.materialImage} resizeMode="contain" />
                </ScrollView>
              ) : (
                <ActivityIndicator size="large" color="#2196f3" style={styles.materialLoader} />
              )
            ) : (
              <ScrollView style={styles.materialTextScroll}>
                <Text style={styles.materialText}>{activeMaterial?.text_content}</Text>
              </ScrollView>
            )}
            {activeMaterial?.material_type === "image" && (
              <TouchableOpacity
                onPress={() => setMaterialModalVisible(false)}
                style={styles.materialFloatingCloseButton}
              >
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Homework Section (worksheet practice + assigned work, one feed) */}
      {homeworkFeed.length > 0 && (
        <View style={styles.homeworkSection}>
          <Text style={styles.homeworkSectionTitle}>📋 {setupCopy.homework}</Text>
          {homeworkFeed.map((item) => (
            <TouchableOpacity
              key={`${item.type}-${item.id}`}
              style={styles.homeworkCard}
              onPress={() =>
                item.type === "episode"
                  ? handleEpisodeTap(item.episode)
                  : handleHomeworkTap(item.id)
              }
            >
              <View style={styles.homeworkInfo}>
                <Text style={styles.homeworkCardTopic} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.homeworkCardCount}>{item.subtitle}</Text>
              </View>
              <Text style={styles.playButton}>▶</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {completedHomeworkFeed.length > 0 && (
        <View style={styles.completedHomeworkSection}>
          <Text style={styles.homeworkSectionTitle}>✅ {setupCopy.completed}</Text>
          {completedHomeworkFeed.map((item) => (
            <View key={item.id} style={styles.completedHomeworkCard}>
              <View style={styles.homeworkInfo}>
                <Text style={styles.homeworkCardTopic} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.homeworkCardCount}>
                  {item.subtitle}
                  {item.completedAt
                    ? ` • ${new Date(item.completedAt).toLocaleDateString()}`
                    : ""}
                </Text>
              </View>
              <Text style={styles.completedCheck}>✓</Text>
            </View>
          ))}
        </View>
      )}

      {/* Show practice tiles only if nothing is queued in the homework feed */}
      {homeworkFeed.length === 0 && (
        <View style={styles.subjectsContainer}>
          {SUBJECTS.map((subject) => {
            const isMathSubject = ["addition", "subtraction", "multiplication", "division"].includes(subject.topic);
            const isWordProblems = subject.topic === "word_problems";
            const operationStatus = isMathSubject ? operationStatuses[subject.topic as Operation] : null;
            const statusText = isWordProblems ? wordProblemsStatus?.childHomeText : operationStatus?.childHomeText;

            return (
              <TouchableOpacity
                key={subject.topic}
                style={[styles.subjectTile, !subject.isActive && styles.subjectTileInactive]}
                onPress={() => subject.isActive && handleSubjectTap(subject.topic)}
                disabled={!subject.isActive}
              >
                <Text style={styles.subjectLabel}>{SUBJECT_COPY[childLanguage][subject.topic].label}</Text>
                <Text style={styles.subjectDescription}>{SUBJECT_COPY[childLanguage][subject.topic].description}</Text>
                {statusText && (
                  <Text style={styles.statusText}>{statusText}</Text>
                )}
                {!subject.isActive && <Text style={styles.comingSoonLabel}>Coming soon</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      </ScrollView>

      {homeworkLimit?.daily_limit_minutes ? (
        <View style={styles.homeworkTimerDebug}>
          <Text style={styles.homeworkTimerDebugText}>
            HW {Math.floor(homeworkTimerSeconds / 60)}:{String(homeworkTimerSeconds % 60).padStart(2, "0")} / {homeworkLimit.daily_limit_minutes}:00
          </Text>
        </View>
      ) : null}

      <Modal
        visible={pinSetupVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.setupOverlay}>
          <View style={styles.setupPanel}>
            <MaterialCommunityIcons name="lock-check" size={36} color="#2196f3" />
            <Text style={styles.setupTitle}>{setupCopy.pinTitle}</Text>
            <Text style={styles.setupBody}>
              {setupCopy.pinBody}
            </Text>
            <TextInput
              style={styles.setupPinInput}
              value={newPin}
              onChangeText={setNewPin}
              placeholder={setupCopy.pinPlaceholder}
              keyboardType="number-pad"
              secureTextEntry={true}
              maxLength={6}
              autoFocus={true}
            />
            <TextInput
              style={styles.setupPinInput}
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder={setupCopy.pinConfirmPlaceholder}
              keyboardType="number-pad"
              secureTextEntry={true}
              maxLength={6}
            />
            {pinSetupError ? <Text style={styles.setupError}>{pinSetupError}</Text> : null}
            <TouchableOpacity
              style={[
                styles.setupPrimaryButton,
                (newPin.length < 4 || confirmPin.length < 4) && styles.setupPrimaryButtonDisabled,
              ]}
              onPress={handlePinSetupSubmit}
              disabled={newPin.length < 4 || confirmPin.length < 4}
            >
              <Text style={styles.setupPrimaryButtonText}>{setupCopy.pinSaveButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={introVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.setupOverlay}>
          <View style={styles.introPanel}>
            <View style={styles.introProgressRow}>
              {introSlides.map((slide, index) => (
                <View
                  key={slide.key}
                  style={[
                    styles.introProgressDot,
                    index === introSlideIndex && styles.introProgressDotActive,
                  ]}
                />
              ))}
            </View>
            <MaterialCommunityIcons name={currentIntroSlide.icon as any} size={40} color="#2196f3" />
            <Text style={styles.setupTitle}>{currentIntroSlide.title}</Text>
            <Text style={styles.setupBody}>{currentIntroSlide.body}</Text>

            {currentIntroSlide.key === "avatar" && (
              <View style={styles.introChoiceBlock}>{renderAvatarChoices()}</View>
            )}
            {currentIntroSlide.key === "background" && (
              <View style={styles.introChoiceBlock}>{renderBackgroundChoices()}</View>
            )}
            {currentIntroSlide.key === "work" && (
              <View style={styles.introExampleRow}>
                <View style={styles.introMiniCard}>
                  <Text style={styles.introMiniTitle}>{setupCopy.homework}</Text>
                  <Text style={styles.introMiniText}>{setupCopy.homeworkBody}</Text>
                </View>
                <View style={styles.introMiniCard}>
                  <Text style={styles.introMiniTitle}>{setupCopy.freePlay}</Text>
                  <Text style={styles.introMiniText}>{setupCopy.freePlayBody}</Text>
                </View>
              </View>
            )}
            {currentIntroSlide.key === "stars" && (
              <View style={styles.introStarsBadge}>
                <Text style={styles.introStarsText}>⭐ 0</Text>
              </View>
            )}

            {introError ? <Text style={styles.setupError}>{introError}</Text> : null}
            <View style={styles.introButtonRow}>
              <TouchableOpacity
                style={[styles.introSecondaryButton, introSlideIndex === 0 && styles.introButtonHidden]}
                onPress={handleIntroBack}
                disabled={introSlideIndex === 0}
              >
                <Text style={styles.introSecondaryButtonText}>{setupCopy.back}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.setupPrimaryButton} onPress={handleIntroNext}>
                <Text style={styles.setupPrimaryButtonText}>
                  {introSlideIndex === introSlides.length - 1 ? setupCopy.start : setupCopy.next}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={settingsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <SafeAreaView style={styles.settingsModalContainer}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>{setupCopy.settings}</Text>
            <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.settingsContent}>
            {/* Avatar Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>{setupCopy.pickAvatar}</Text>
              {renderAvatarChoices()}
            </View>

            {/* Background Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>{setupCopy.pickBackground}</Text>
              {renderBackgroundChoices()}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  solidBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
    backgroundColor: "transparent",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  leftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  allDoneButton: {
    paddingVertical: 4,
  },
  allDoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
  },
  topRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shopButton: {
    paddingHorizontal: 4,
  },
  shopIcon: {
    fontSize: 20,
  },
  greetingBanner: {
    backgroundColor: "#f0f8ff",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 32,
  },
  avatarEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  starsText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffc107",
  },
  subjectsContainer: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  subjectTile: {
    width: "48%",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  subjectTileInactive: {
    opacity: 0.7,
  },
  subjectLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 6,
    textAlign: "center",
  },
  subjectDescription: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 16,
  },
  comingSoonLabel: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    marginTop: 8,
  },
  statusText: {
    fontSize: 11,
    color: "#2196f3",
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 14,
  },
  button: {
    backgroundColor: "#0000ff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#d32f2f",
    marginBottom: 20,
    textAlign: "center",
  },
  schoolHomeworkSection: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  schoolHomeworkDayGroup: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  schoolHomeworkDayHeader: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  schoolHomeworkDayStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  schoolHomeworkDayCount: {
    fontSize: 13,
    fontWeight: "800",
    color: "#607d8b",
  },
  schoolHomeworkEmpty: {
    paddingBottom: 12,
    fontSize: 13,
    color: "#78909c",
  },
  schoolHomeworkDate: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#263238",
    textTransform: "capitalize",
  },
  schoolHomeworkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  schoolHomeworkItemDone: {
    opacity: 0.72,
  },
  schoolHomeworkCheck: {
    padding: 2,
  },
  schoolHomeworkTextWrap: {
    flex: 1,
  },
  schoolHomeworkText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#263238",
  },
  schoolHomeworkTextDone: {
    textDecorationLine: "line-through",
    color: "#607d8b",
  },
  schoolHomeworkMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#78909c",
    textTransform: "capitalize",
  },
  materialModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 18,
  },
  materialModal: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  materialModalImageFullscreen: {
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    borderRadius: 0,
  },
  materialModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eceff1",
  },
  materialModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#263238",
  },
  materialCloseButton: {
    padding: 4,
  },
  materialFloatingCloseButton: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  materialImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f5f5f5",
  },
  materialImageZoom: {
    width: "100%",
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  materialImageZoomContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  materialLoader: {
    height: 240,
  },
  materialTextScroll: {
    maxHeight: 460,
    padding: 16,
  },
  materialText: {
    fontSize: 17,
    lineHeight: 26,
    color: "#263238",
  },
  homeworkTimerDebug: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(38,50,56,0.86)",
  },
  homeworkTimerDebugText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  homeworkSection: {
    backgroundColor: "#fef3e0",
    borderLeftWidth: 4,
    borderLeftColor: "#ff9800",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  completedHomeworkSection: {
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  homeworkSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  homeworkCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffe0b2",
  },
  completedHomeworkCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c8e6c9",
  },
  homeworkInfo: {
    flex: 1,
  },
  homeworkCardTopic: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  homeworkCardCount: {
    fontSize: 12,
    color: "#666",
  },
  playButton: {
    fontSize: 20,
    marginLeft: 12,
  },
  completedCheck: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4caf50",
    marginLeft: 12,
  },
  episodesSection: {
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  episodesSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  episodeCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c8e6c9",
  },
  episodeInfo: {
    flex: 1,
    gap: 8,
  },
  episodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  episodeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#4caf50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  episodeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  setupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  setupPanel: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  introPanel: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  setupTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: "#1a1a1a",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  setupBody: {
    fontSize: 15,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 18,
  },
  setupPinInput: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#dbeafe",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 22,
    textAlign: "center",
    letterSpacing: 3,
    marginBottom: 10,
    backgroundColor: "#f8fbff",
  },
  setupError: {
    color: "#d32f2f",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  setupPrimaryButton: {
    minWidth: 120,
    backgroundColor: "#0000ff",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
  },
  setupPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  setupPrimaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  introProgressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 18,
  },
  introProgressDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#dbeafe",
  },
  introProgressDotActive: {
    backgroundColor: "#2196f3",
  },
  introChoiceBlock: {
    width: "100%",
    marginTop: 6,
    marginBottom: 16,
  },
  introExampleRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  introMiniCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: "#f5f9ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 12,
    justifyContent: "center",
  },
  introMiniTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1a1a1a",
    marginBottom: 6,
    textAlign: "center",
  },
  introMiniText: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748b",
    textAlign: "center",
  },
  introStarsBadge: {
    minWidth: 110,
    borderRadius: 8,
    backgroundColor: "#fff7e0",
    borderWidth: 1,
    borderColor: "#ffe0a3",
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  introStarsText: {
    fontSize: 26,
    fontWeight: "900",
    color: "#d99a00",
    textAlign: "center",
  },
  introButtonRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  introSecondaryButton: {
    minWidth: 92,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#fff",
  },
  introSecondaryButtonText: {
    color: "#2196f3",
    fontSize: 15,
    fontWeight: "800",
  },
  introButtonHidden: {
    opacity: 0,
  },
  settingsModalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  settingsContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  settingsSection: {
    marginBottom: 32,
  },
  settingsSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  avatarOption: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  avatarOptionSelected: {
    borderColor: "#2196f3",
    backgroundColor: "#e3f2fd",
  },
  avatarOptionEmoji: {
    fontSize: 48,
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  backgroundOption: {
    width: "48%",
    height: 100,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
    backgroundColor: "#f5f5f5",
  },
  backgroundOptionSelected: {
    borderColor: "#2196f3",
  },
  backgroundLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 8,
  },
  giraffePreview: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: "#FBF3E1",
  },
});
