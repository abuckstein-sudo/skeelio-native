import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Modal, TextInput, Image, Alert, Linking, KeyboardAvoidingView, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { getOperationStatus, OperationStatus, getWordProblemsStatus, WordProblemsStatus } from "@/lib/tutor/status";
import { LADDERS, Operation } from "@/lib/tutorConfig";
import { Attempt, factTierCoverageGapAfterOtherGates } from "@/lib/tutor/ability";
import { computeUnlockState, SubjectId, SubjectUnlockState } from "@/lib/tutor/unlockGraph";
import { listAssignmentsForChild, Assignment } from "@/lib/assignments";
import {
  listSchoolHomeworkWeek,
  schoolHomeworkDateLabel,
  schoolHomeworkShortDateLabel,
  SchoolHomeworkDay,
  SchoolHomeworkItem,
  SchoolHomeworkMaterial,
  setSchoolHomeworkItemDone,
  signedSchoolHomeworkImageUrl,
  signedSchoolHomeworkDocumentUrl,
  schoolHomeworkMaterialTitle,
  todayDateKey,
  schoolHomeworkWeekDateKeys,
  replaceSchoolHomeworkDay,
  extractSchoolHomeworkFromImage,
} from "@/lib/schoolHomework";
import { addHomeworkActiveSeconds, ChildHomeworkLimit, getChildHomeworkLimit } from "@/lib/homeworkTime";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import CameraCaptureModal from "@/components/CameraCaptureModal";
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
  allow_child_homework_entry?: boolean;
  max_addition_number?: number | null;
  max_times_table?: number | null;
  math_subtraction_level?: string | null;
  math_division_level?: string | null;
  focus_subjects?: string[] | null;
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

const CURRICULUM_ORDER: Record<string, number> = {
  addition: 0,
  subtraction: 1,
  multiplication: 2,
  division: 3,
  word_problems: 4,
  spelling: 5,
  conjugation: 6,
  reading: 7,
};

const curriculumOrderFor = (topic: string) =>
  CURRICULUM_ORDER[topic] ?? Number.MAX_SAFE_INTEGER;

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

const MATH_OPERATIONS: Operation[] = ["addition", "subtraction", "multiplication", "division"];
const UNLOCK_STORAGE_PREFIX = "skeelio:unlockedSeen:";

interface NextUpTile {
  subject: SubjectTile;
  unlockState: SubjectUnlockState;
}

const TIER_LABEL_COPY: Record<ChildHomeLanguage, Partial<Record<string, string>>> = {
  en: {},
  fr: {
    A1: "les additions jusqu'à 10",
    A2: "les additions jusqu'à 18 avec passage par 10",
    A3: "les additions à deux chiffres plus un chiffre",
    A4: "les additions à deux chiffres sans retenue",
    A5: "les additions à deux chiffres avec retenue",
    A6: "les additions à trois chiffres avec retenue",
    A7: "les additions à quatre chiffres, avec ou sans retenue",
    S1: "les soustractions jusqu'à 10 sans emprunt",
    S2: "les soustractions jusqu'à 20 avec passage par 10",
    S3: "les soustractions à deux chiffres moins un chiffre",
    S4: "les soustractions à deux chiffres sans emprunt",
    S5: "les soustractions à deux chiffres avec emprunt",
    S6: "les soustractions à trois chiffres avec emprunt",
    S7: "les soustractions à quatre chiffres avec emprunt à travers les zéros",
    M1: "les tables de 0, 1, 2 et 10",
    M2: "la table de 5",
    M3: "les tables de 3 et 4",
    M4: "les tables de 6, 7, 8 et 9",
    M5: "les tables de 11 et 12",
    M6: "les multiplications à deux chiffres par un chiffre",
    M7: "les multiplications à deux chiffres par deux chiffres",
    D1: "les divisions par 1, 2, 5 et 10",
    D2: "les divisions par 3 et 4",
    D3: "les divisions par 6, 7, 8 et 9",
    D4: "les divisions avec reste",
    D5: "les divisions à deux chiffres exactes",
    D6: "les divisions à deux chiffres avec reste",
    D7: "les divisions posées",
  },
};

const emptyMathAttempts = (): Record<Operation, Attempt[]> => ({
  addition: [],
  subtraction: [],
  multiplication: [],
  division: [],
});

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
    greetingHomework: "let's do your homework!",
    greetingChoice: "What would you like to work on today?",
    greetingTimeUp: "you have worked hard today. Ask your adult for more time if you need it.",
    freePlay: "Free play",
    freePlayBody: "Choose practice tiles",
    nextMathKicker: "Next up",
    nextMathActionTeach: "Learn",
    nextMathActionPractice: "Practice",
    almostThereFacts: (covered: number, required: number) => `Almost there — ${covered} of ${required} facts`,
    locked: "Locked",
    lockedUntil: (tierLabel: string, subjectLabel: string) => `Master ${tierLabel} to unlock ${subjectLabel}`,
    unlockedTitle: "You unlocked it!",
    unlockedBody: (subjectLabel: string) => `Great work! You unlocked ${subjectLabel}!`,
    settings: "Settings",
    addHomework: "Add homework",
    addHomeworkPlaceholder: "Write one homework item per line",
    saveHomework: "Save homework",
    cancel: "Cancel",
    helpedBy: "Who helped you?",
    helpedByPlaceholder: "Name",
    IWorkedAlone: "I worked alone",
    saveHelper: "Save",
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
    greetingHomework: "on fait tes devoirs !",
    greetingChoice: "Que veux-tu travailler aujourd'hui ?",
    greetingTimeUp: "tu as bien travaillé aujourd'hui. Demande plus de temps à ton adulte si besoin.",
    freePlay: "Jeu libre",
    freePlayBody: "Choisis une activité",
    nextMathKicker: "Et maintenant",
    nextMathActionTeach: "Découvrir",
    nextMathActionPractice: "S'entraîner",
    almostThereFacts: (covered: number, required: number) => `Tu y es presque — ${covered} faits sur ${required}`,
    locked: "Verrouillé",
    lockedUntil: (tierLabel: string, subjectLabel: string) => `Réussis ${tierLabel} pour débloquer ${subjectLabel}`,
    unlockedTitle: "Bravo !",
    unlockedBody: (subjectLabel: string) => `Tu as débloqué ${subjectLabel} !`,
    settings: "Réglages",
    addHomework: "Ajouter un devoir",
    addHomeworkPlaceholder: "Écris un devoir par ligne",
    saveHomework: "Enregistrer",
    cancel: "Annuler",
    helpedBy: "Qui t'a aidé ?",
    helpedByPlaceholder: "Prénom",
    IWorkedAlone: "J'ai travaillé seul(e)",
    saveHelper: "Enregistrer",
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

const tierLabelForChild = (
  operation: Operation,
  tierId: string,
  language: ChildHomeLanguage
) => {
  return TIER_LABEL_COPY[language][tierId] || LADDERS[operation].find((tier) => tier.id === tierId)?.label || tierId;
};

const coverageProgressForMathTile = (
  operation: Operation,
  tierId: string,
  attemptsByOperation: Record<Operation, Attempt[]>
) => {
  return factTierCoverageGapAfterOtherGates(tierId, attemptsByOperation[operation] || []);
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
  const [attemptsByOperation, setAttemptsByOperation] = useState<Record<Operation, Attempt[]>>(emptyMathAttempts);
  const [wordProblemsStatus, setWordProblemsStatus] = useState<WordProblemsStatus | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);
  const [pendingEpisodes, setPendingEpisodes] = useState<any[]>([]);
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
  const [childHomeworkModalDate, setChildHomeworkModalDate] = useState<string | null>(null);
  const [childHomeworkInput, setChildHomeworkInput] = useState("");
  const [savingChildHomework, setSavingChildHomework] = useState(false);
  const [childHomeworkCameraVisible, setChildHomeworkCameraVisible] = useState(false);
  const [extractingChildHomeworkPhoto, setExtractingChildHomeworkPhoto] = useState(false);
  const [helperItem, setHelperItem] = useState<SchoolHomeworkItem | null>(null);
  const [helperName, setHelperName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSetupError, setPinSetupError] = useState("");
  const [introSlideIndex, setIntroSlideIndex] = useState(0);
  const [introError, setIntroError] = useState("");
  const [unlockCelebration, setUnlockCelebration] = useState<{ subjectId: SubjectId; label: string } | null>(null);
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
    setPendingAssignments(pending);

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
      fetchSchoolHomework(),
    ]);
  }, [fetchPendingAssignments, fetchPendingEpisodes, fetchSchoolHomework]);

  const maybeCelebrateUnlocks = useCallback(async (
    statuses: Record<Operation, OperationStatus>,
    childForUnlock: Child,
    shouldCelebrate: boolean
  ) => {
    if (!childId) return;

    const highestSolidTierByOperation = MATH_OPERATIONS.reduce((acc, operation) => {
      acc[operation] = statuses[operation]?.highestSolidTierId ?? null;
      return acc;
    }, {} as Record<Operation, string | null>);
    const unlockState = computeUnlockState(highestSolidTierByOperation, childForUnlock);
    const unlockedIds = Object.entries(unlockState)
      .filter(([, state]) => state.unlocked)
      .map(([subjectId]) => subjectId as SubjectId);
    const storageKey = `${UNLOCK_STORAGE_PREFIX}${childId}`;
    const stored = await AsyncStorage.getItem(storageKey);

    if (!stored) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(unlockedIds));
      return;
    }

    const seenIds = new Set<string>(JSON.parse(stored));
    const newlyUnlocked = unlockedIds.filter((subjectId) => !seenIds.has(subjectId));
    if (newlyUnlocked.length === 0) return;

    await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(new Set([...seenIds, ...unlockedIds]))));
    if (!shouldCelebrate) return;

    const language = getChildHomeLanguage(childForUnlock);
    const subjectId = newlyUnlocked[0];
    setUnlockCelebration({
      subjectId,
      label: SUBJECT_COPY[language][subjectId]?.label || subjectId,
    });
  }, [childId]);

  const refreshMathProgress = useCallback(async (childForStatus?: Child | null, shouldCelebrate = false) => {
    if (!childId) return;

    const { data: attemptRows, error: attemptError } = await supabase
      .from("learning_attempts")
      .select("topic, tier, question_text, was_correct, ai_hint_used, evidence_source")
      .eq("child_id", childId)
      .in("topic", MATH_OPERATIONS)
      .not("tier", "is", null);

    if (attemptError) {
      console.error("[child-home] failed to fetch math attempts:", attemptError);
      setAttemptsByOperation(emptyMathAttempts());
    } else {
      const groupedAttempts = emptyMathAttempts();
      (attemptRows || []).forEach((row: any) => {
        const operation = row.topic as Operation;
        if (!MATH_OPERATIONS.includes(operation)) return;
        groupedAttempts[operation].push({
          tierId: row.tier,
          correct: row.was_correct,
          hintUsed: row.ai_hint_used || false,
          questionText: row.question_text,
          evidenceSource: row.evidence_source,
        });
      });
      setAttemptsByOperation(groupedAttempts);
    }

    const statusChild = childForStatus || child;
    if (!statusChild) return;

    const statuses: Record<Operation, OperationStatus> = {} as any;
    for (const op of MATH_OPERATIONS) {
      const status = await getOperationStatus(childId, op, statusChild);
      statuses[op] = status;
    }
    setOperationStatuses(statuses);
    await maybeCelebrateUnlocks(statuses, statusChild, shouldCelebrate);
  }, [child, childId, maybeCelebrateUnlocks]);

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
      refreshMathProgress(child, true);
    }, [child, fetchStars, refreshHomeworkFeed, refreshMathProgress])
  );

  const fetchChild = async () => {
    if (!childId) return;

    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, selected_avatar, home_background, pin, pin_setup_required, intro_seen, preferred_language, languages, allow_child_homework_entry, max_addition_number, max_times_table, math_subtraction_level, math_division_level, focus_subjects")
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

    await refreshMathProgress(data as Child, false);

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

  const handleNextMathTap = (
    operation: Operation,
    tierId: string,
    tierLabel: string,
    mode: "teach" | "practice"
  ) => {
    if (!childId) return;

    if (mode === "teach") {
      router.push({
        pathname: "/lesson/[childId]",
        params: {
          childId,
          tierId,
          tierLabel,
          operation,
        },
      });
      return;
    }

    router.push({
      pathname: "/practice",
      params: {
        topic: operation,
        childId,
        tierId,
        tierLabel,
      },
    });
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
    if (item.linked_spelling_list_id) {
      router.push({
        pathname: "/spelling/[listId]",
        params: item.linked_assignment_id
          ? { listId: item.linked_spelling_list_id, childId, assignmentId: item.linked_assignment_id, mode: "practice" }
          : { listId: item.linked_spelling_list_id, childId, mode: "practice" },
      });
      return;
    }

    if (item.linked_assignment_id) {
      await handleHomeworkTap(item.linked_assignment_id);
      return;
    }

    const material = (item.school_homework_materials || [])[0];
    if (material) {
      if (material.material_type === "document") {
        const url = await signedSchoolHomeworkDocumentUrl(material);
        if (url) {
          await Linking.openURL(url);
        } else {
          alert("Could not open this document");
        }
        return;
      }

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
    if (item.status !== "done") {
      setHelperItem(item);
      setHelperName("");
      return;
    }
  };

  const completeHelperItem = async (completedBy: "child" | "helper", name?: string) => {
    if (!helperItem) return;
    try {
      await setSchoolHomeworkItemDone(helperItem, true, completedBy, name);
      setHelperItem(null);
      setHelperName("");
      await fetchSchoolHomework();
    } catch (err) {
      console.error("[child-home] helper completion error:", err);
      alert("Could not update homework");
    }
  };

  const openChildHomeworkModal = (dateKey: string, existingText = "") => {
    setChildHomeworkModalDate(dateKey);
    setChildHomeworkInput(existingText);
  };

  const handleChildHomeworkPhotoCaptured = async (uri: string) => {
    const language = getChildHomeLanguage(child);
    try {
      setExtractingChildHomeworkPhoto(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1300 } }],
        { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) throw new Error("Could not read homework image");

      const extracted = await extractSchoolHomeworkFromImage(manipulated.base64, "image/jpeg");
      if (extracted.items.length === 0) {
        alert(language === "fr" ? "Je n'ai pas trouvé de devoir dans cette photo." : "I could not find homework in that photo.");
        return;
      }

      setChildHomeworkInput((current) =>
        [current.trim(), extracted.items.join("\n")].filter(Boolean).join("\n")
      );
    } catch (err) {
      console.error("[child-home] child homework photo error:", err);
      alert(language === "fr" ? "Impossible de lire cette photo." : "Could not read that photo.");
    } finally {
      setExtractingChildHomeworkPhoto(false);
    }
  };

  const handlePickChildHomeworkPhoto = async () => {
    const language = getChildHomeLanguage(child);
    if (extractingChildHomeworkPhoto) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert(language === "fr" ? "Autorise les photos pour choisir une image." : "Allow photo access to choose a picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        await handleChildHomeworkPhotoCaptured(result.assets[0].uri);
      }
    } catch (err) {
      console.error("[child-home] child homework library error:", err);
      alert(language === "fr" ? "Impossible de choisir cette photo." : "Could not choose that photo.");
    }
  };

  const handleSaveChildHomework = async () => {
    if (!childId || !childHomeworkModalDate || !childHomeworkInput.trim()) return;
    try {
      setSavingChildHomework(true);
      const existingDay = schoolHomeworkWeekDays.find((day) => day?.homework_date === childHomeworkModalDate) || null;
      const existingRawInput = (existingDay?.raw_input || "").trim();
      const nextRawInput = [existingRawInput, childHomeworkInput.trim()]
        .filter(Boolean)
        .join("\n");
      await replaceSchoolHomeworkDay({
        childId,
        homeworkDate: childHomeworkModalDate,
        rawInput: nextRawInput,
        sourceType: existingDay?.source_type || "child",
      });
      setChildHomeworkModalDate(null);
      setChildHomeworkInput("");
      await fetchSchoolHomework();
    } catch (err) {
      console.error("[child-home] child homework save error:", err);
      alert("Could not save homework");
    } finally {
      setSavingChildHomework(false);
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
  const childCanAddHomework = Boolean(child.allow_child_homework_entry);
  const visibleSchoolDateKeys = schoolWeekDateKeys.filter((dateKey) => {
    const day = schoolHomeworkByDate.get(dateKey) || null;
    const items = day?.school_homework_items || [];
    const datedAssignments = pendingAssignments.filter((assignment) => {
      if (!assignment.due_date) return false;
      return assignment.due_date.slice(0, 10) === dateKey;
    });
    return items.length > 0 || datedAssignments.length > 0;
  });
  const hasSchoolHomework = visibleSchoolDateKeys.length > 0;
  const todayHasHomework = visibleSchoolDateKeys.includes(todayDateKey());
  const remainingSchoolHomeworkCount = schoolHomeworkWeekDays.reduce(
    (count, day) => count + (day?.school_homework_items || []).filter((item) => item.status !== "done").length,
    0
  );

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
    ...pendingAssignments.filter((a) => !schoolLinkedAssignmentIds.has(a.id) && !a.due_date).map((a) => {
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

  const setupCopy = SETUP_COPY[getChildHomeLanguage(child)];
  const childLanguage = getChildHomeLanguage(child);
  const limitMinutes = homeworkLimit?.daily_limit_minutes;
  const timeIsUp = Boolean(
    limitMinutes &&
    homeworkLimit?.unlocked_date !== todayDateKey() &&
    homeworkTimerSeconds >= limitMinutes * 60
  );
  const hasRemainingHomework = homeworkFeed.length > 0 || remainingSchoolHomeworkCount > 0;
  const allMathStatusesLoaded = MATH_OPERATIONS.every((operation) => operationStatuses[operation]);
  const mathDataReady = !!child && allMathStatusesLoaded;
  const highestSolidTierByOperation = MATH_OPERATIONS.reduce((acc, operation) => {
    acc[operation] = operationStatuses[operation]?.highestSolidTierId ?? null;
    return acc;
  }, {} as Record<Operation, string | null>);
  const unlockState = mathDataReady
    ? computeUnlockState(highestSolidTierByOperation, child)
    : null;
  const focusedSubjects = Array.isArray(child?.focus_subjects)
    ? new Set(child.focus_subjects)
    : new Set(SUBJECTS.map((subject) => subject.topic));
  const nextUpTiles: NextUpTile[] = unlockState
    ? SUBJECTS
        .filter((subject) => subject.isActive)
        .filter((subject) => focusedSubjects.has(subject.topic))
        .map((subject) => ({
          subject,
          unlockState: unlockState[subject.topic as SubjectId],
        }))
        .sort((a, b) => {
          const aLocked = a.unlockState?.unlocked ? 0 : 1;
          const bLocked = b.unlockState?.unlocked ? 0 : 1;
          return aLocked - bLocked || curriculumOrderFor(a.subject.topic) - curriculumOrderFor(b.subject.topic);
        })
    : [];
  const subjectLabel = (topic: string) => SUBJECT_COPY[childLanguage][topic]?.label || topic;
  const subjectDescription = (topic: string) => SUBJECT_COPY[childLanguage][topic]?.description || "";
  const lockedText = (state: SubjectUnlockState, topic: string) => {
    if (!state.reasonOperation || !state.reasonTierId) return setupCopy.locked;
    return setupCopy.lockedUntil(
      tierLabelForChild(state.reasonOperation, state.reasonTierId, childLanguage),
      subjectLabel(topic)
    );
  };
  const mathTileMeta = (operation: Operation) => {
    const status = operationStatuses[operation];
    if (!status) return null;
    const tierId = status.workingTierId;
    const tierLabel = tierLabelForChild(operation, tierId, childLanguage);
    const tierAttempts = attemptsByOperation[operation] || [];
    const isBrandNewTier = !tierAttempts.some((attempt) => attempt.tierId === tierId);
    const coverageProgress = coverageProgressForMathTile(operation, tierId, attemptsByOperation);
    return {
      tierId,
      tierLabel,
      mode: isBrandNewTier ? "teach" as const : "practice" as const,
      action: isBrandNewTier ? setupCopy.nextMathActionTeach : setupCopy.nextMathActionPractice,
      coverageText: coverageProgress
        ? setupCopy.almostThereFacts(coverageProgress.covered, coverageProgress.required)
        : "",
    };
  };
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
          {getChildHomeLanguage(child) === "fr" ? `Salut ${child.name}, ` : `Hi ${child.name}, `}
          {timeIsUp
            ? setupCopy.greetingTimeUp
            : hasRemainingHomework
              ? setupCopy.greetingHomework
              : setupCopy.greetingChoice}
        </Text>
      </View>

      {childCanAddHomework && !todayHasHomework && (
        <TouchableOpacity
          style={styles.emptyAddHomeworkCard}
          onPress={() => openChildHomeworkModal(todayDateKey())}
        >
          <MaterialCommunityIcons name="plus-circle" size={30} color="#1565c0" />
          <View style={styles.emptyAddHomeworkTextWrap}>
            <Text style={styles.emptyAddHomeworkTitle}>{setupCopy.addHomework}</Text>
            <Text style={styles.emptyAddHomeworkBody}>
              {childLanguage === "fr" ? "Ajoute un devoir si tu en as un aujourd'hui." : "Add homework if you have something to do today."}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {hasSchoolHomework && (
        <View style={styles.schoolHomeworkSection}>
          {visibleSchoolDateKeys.map((dateKey) => {
            const day = schoolHomeworkByDate.get(dateKey) || null;
            const items = day?.school_homework_items || [];
            const datedAssignments = pendingAssignments.filter((assignment) => {
              if (!assignment.due_date || schoolLinkedAssignmentIds.has(assignment.id)) return false;
              return assignment.due_date.slice(0, 10) === dateKey;
            });
            const doneCount = items.filter((item) => item.status === "done").length;
            const remainingCount = items.length + datedAssignments.length;
            const expanded = expandedHomeworkDate === dateKey;
            const canChildEditDate = childCanAddHomework;
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
                    {remainingCount > 0 && (
                      <Text style={styles.schoolHomeworkDayCount}>{doneCount}/{remainingCount}</Text>
                    )}
                    {canChildEditDate && (
                      <TouchableOpacity
                        style={styles.childHomeworkPlus}
                        onPress={() => openChildHomeworkModal(dateKey)}
                      >
                        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <MaterialCommunityIcons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#78909c"
                    />
                  </View>
                </TouchableOpacity>
                {expanded && items.length === 0 && (
                  datedAssignments.length === 0 &&
                  <Text style={styles.schoolHomeworkEmpty}>
                    {childLanguage === "fr" ? "Pas de devoirs enregistrés" : "No homework saved"}
                  </Text>
                )}
                {expanded && datedAssignments.map((assignment) => {
                  const isSpelling = assignment.subject === "spelling";
                  const base = (assignment.focus || assignment.subject || "Practice") as string;
                  const title = isSpelling
                    ? `Spelling: ${(assignment.custom_questions as any)?.title || "Spelling List"}`
                    : base.charAt(0).toUpperCase() + base.slice(1);
                  return (
                    <TouchableOpacity
                      key={assignment.id}
                      style={styles.schoolHomeworkItem}
                      activeOpacity={0.8}
                      onPress={() => handleHomeworkTap(assignment.id)}
                    >
                      <MaterialCommunityIcons name="play-circle-outline" size={26} color="#2196f3" />
                      <View style={styles.schoolHomeworkTextWrap}>
                        <Text style={styles.schoolHomeworkText}>{title}</Text>
                        <Text style={styles.schoolHomeworkMeta}>
                          {assignment.question_count} {isSpelling ? "words" : "questions"} · {childLanguage === "fr" ? "appuie pour pratiquer" : "tap to practice"}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color="#90a4ae" />
                    </TouchableOpacity>
                  );
                })}
                {expanded && items.map((item) => {
            const done = item.status === "done";
            const linked = !!item.linked_assignment_id || !!item.linked_spelling_list_id;
            const hasMaterial = (item.school_homework_materials || []).length > 0;
            const needsMaterial = Boolean((item.metadata as any)?.needs_material) && !hasMaterial;
            const canOpen = linked || hasMaterial;
            const materialLabel = hasMaterial ? schoolHomeworkMaterialTitle(item) : "";
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
                  disabled={item.status === "waiting_parent" || done}
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
                          ? materialLabel
                          : needsMaterial
                            ? childLanguage === "fr" ? "un adulte doit ajouter le document" : "needs a document from an adult"
                            : item.task_kind}
                  </Text>
                </View>
                {canOpen && (
                  <MaterialCommunityIcons
                    name={hasMaterial && !linked ? "file-document-outline" : "chevron-right"}
                    size={22}
                    color="#90a4ae"
                  />
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

      <Modal
        visible={Boolean(childHomeworkModalDate)}
        transparent
        animationType="slide"
        onRequestClose={() => setChildHomeworkModalDate(null)}
      >
        <View style={styles.childHomeworkModalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.childHomeworkKeyboardAvoider}
          >
            <View style={styles.childHomeworkModal}>
              <Text style={styles.childHomeworkModalTitle}>{setupCopy.addHomework}</Text>
              {childHomeworkModalDate && (
                <Text style={styles.childHomeworkModalDate}>
                  {schoolHomeworkDateLabel(childHomeworkModalDate, childLanguage)}
                </Text>
              )}
              <View style={styles.childHomeworkPhotoRow}>
                <TouchableOpacity
                  style={styles.childHomeworkPhotoButton}
                  onPress={() => setChildHomeworkCameraVisible(true)}
                  disabled={extractingChildHomeworkPhoto}
                >
                  <MaterialCommunityIcons name="camera-outline" size={17} color="#1565c0" />
                  <Text style={styles.childHomeworkPhotoText}>
                    {childLanguage === "fr" ? "Photo" : "Take photo"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.childHomeworkPhotoButton}
                  onPress={() => void handlePickChildHomeworkPhoto()}
                  disabled={extractingChildHomeworkPhoto}
                >
                  {extractingChildHomeworkPhoto ? (
                    <ActivityIndicator size="small" color="#1565c0" />
                  ) : (
                    <MaterialCommunityIcons name="image-outline" size={17} color="#1565c0" />
                  )}
                  <Text style={styles.childHomeworkPhotoText}>
                    {childLanguage === "fr" ? "Choisir" : "Choose photo"}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.childHomeworkInput}
                value={childHomeworkInput}
                onChangeText={setChildHomeworkInput}
                placeholder={setupCopy.addHomeworkPlaceholder}
                placeholderTextColor="#78909c"
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.childHomeworkModalActions}>
                <TouchableOpacity
                  style={styles.childHomeworkCancelButton}
                  onPress={() => setChildHomeworkModalDate(null)}
                  disabled={savingChildHomework}
                >
                  <Text style={styles.childHomeworkCancelText}>{setupCopy.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.childHomeworkSaveButton, (!childHomeworkInput.trim() || savingChildHomework) && styles.childHomeworkSaveButtonDisabled]}
                  onPress={() => void handleSaveChildHomework()}
                  disabled={!childHomeworkInput.trim() || savingChildHomework}
                >
                  <Text style={styles.childHomeworkSaveText}>
                    {savingChildHomework ? "..." : setupCopy.saveHomework}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <CameraCaptureModal
        visible={childHomeworkCameraVisible}
        onCaptured={(uri) => {
          setChildHomeworkCameraVisible(false);
          void handleChildHomeworkPhotoCaptured(uri);
        }}
        onClose={() => setChildHomeworkCameraVisible(false)}
      />

      <Modal
        visible={Boolean(helperItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setHelperItem(null)}
      >
        <View style={styles.childHomeworkModalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.childHomeworkKeyboardAvoider}
          >
            <View style={styles.childHomeworkModal}>
              <Text style={styles.childHomeworkModalTitle}>{setupCopy.helpedBy}</Text>
              <TextInput
                style={styles.helperInput}
                value={helperName}
                onChangeText={setHelperName}
                placeholder={setupCopy.helpedByPlaceholder}
                placeholderTextColor="#78909c"
                autoFocus
              />
              <View style={styles.childHomeworkModalActions}>
                <TouchableOpacity
                  style={styles.childHomeworkCancelButton}
                  onPress={() => void completeHelperItem("child")}
                >
                  <Text style={styles.childHomeworkCancelText}>{setupCopy.IWorkedAlone}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.childHomeworkSaveButton, !helperName.trim() && styles.childHomeworkSaveButtonDisabled]}
                  onPress={() => void completeHelperItem("helper", helperName)}
                  disabled={!helperName.trim()}
                >
                  <Text style={styles.childHomeworkSaveText}>{setupCopy.saveHelper}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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

      {nextUpTiles.length > 0 && (
        <View style={styles.nextUpSection}>
          <Text style={styles.homeworkSectionTitle}>{setupCopy.nextMathKicker}</Text>
          {nextUpTiles.map(({ subject, unlockState: state }) => {
            const isMathSubject = MATH_OPERATIONS.includes(subject.topic as Operation);
            const mathMeta = isMathSubject ? mathTileMeta(subject.topic as Operation) : null;
            const unlocked = state?.unlocked;
            const title = mathMeta?.tierLabel || subjectLabel(subject.topic);
            const subtitle = unlocked
              ? mathMeta?.action || subjectDescription(subject.topic)
              : lockedText(state, subject.topic);

            return (
              <TouchableOpacity
                key={`next-${subject.topic}`}
                style={[styles.nextMathCard, !unlocked && styles.nextMathCardLocked]}
                activeOpacity={unlocked ? 0.86 : 1}
                onPress={() => {
                  if (!unlocked) return;
                  if (mathMeta && isMathSubject) {
                    handleNextMathTap(subject.topic as Operation, mathMeta.tierId, mathMeta.tierLabel, mathMeta.mode);
                    return;
                  }
                  handleSubjectTap(subject.topic);
                }}
                disabled={!unlocked}
              >
                <View style={[styles.nextMathIconWrap, !unlocked && styles.nextMathIconWrapLocked]}>
                  <MaterialCommunityIcons
                    name={unlocked ? "arrow-right-circle" : "lock-outline"}
                    size={26}
                    color="#fff"
                  />
                </View>
                <View style={styles.nextMathTextWrap}>
                  <Text style={styles.nextMathKicker}>{unlocked ? subjectLabel(subject.topic) : setupCopy.locked}</Text>
                  <Text style={styles.nextMathTitle}>{title}</Text>
                  <Text style={styles.nextMathMeta}>{subtitle}</Text>
                  {mathMeta?.coverageText ? (
                    <Text style={styles.nextMathCoverage}>{mathMeta.coverageText}</Text>
                  ) : null}
                </View>
                {unlocked ? (
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#1565c0" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.subjectsContainer}>
        <Text style={styles.homeworkSectionTitle}>{setupCopy.freePlay}</Text>
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
      </ScrollView>

      <Modal
        visible={!!unlockCelebration}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setUnlockCelebration(null)}
      >
        <View style={styles.unlockModalBackdrop}>
          <View style={styles.unlockModalCard}>
            <MaterialCommunityIcons name="star-circle" size={52} color="#ffc107" />
            <Text style={styles.unlockModalTitle}>{setupCopy.unlockedTitle}</Text>
            <Text style={styles.unlockModalBody}>
              {unlockCelebration ? setupCopy.unlockedBody(unlockCelebration.label) : ""}
            </Text>
            <TouchableOpacity style={styles.unlockModalButton} onPress={() => setUnlockCelebration(null)}>
              <Text style={styles.unlockModalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  nextUpSection: {
    marginBottom: 18,
  },
  nextMathCard: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#e3f2fd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#90caf9",
  },
  nextMathCardLocked: {
    backgroundColor: "#eeeeee",
    borderColor: "#d6d6d6",
  },
  nextMathIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196f3",
  },
  nextMathIconWrapLocked: {
    backgroundColor: "#9e9e9e",
  },
  nextMathTextWrap: {
    flex: 1,
  },
  nextMathKicker: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1565c0",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  nextMathTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0d47a1",
    lineHeight: 23,
  },
  nextMathMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#1565c0",
  },
  nextMathCoverage: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#5c6f82",
  },
  unlockModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  unlockModalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  unlockModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1a1a1a",
    marginTop: 12,
    marginBottom: 8,
  },
  unlockModalBody: {
    fontSize: 16,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
  unlockModalButton: {
    marginTop: 18,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  unlockModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
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
  childHomeworkPlus: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#2196f3",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
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
  emptyAddHomeworkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbdefb",
    padding: 14,
    marginBottom: 18,
  },
  emptyAddHomeworkTextWrap: {
    flex: 1,
  },
  emptyAddHomeworkTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1565c0",
  },
  emptyAddHomeworkBody: {
    fontSize: 12,
    lineHeight: 16,
    color: "#455a64",
    marginTop: 2,
  },
  childHomeworkModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  childHomeworkKeyboardAvoider: {
    justifyContent: "flex-end",
    width: "100%",
  },
  childHomeworkModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 18,
  },
  childHomeworkModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#263238",
  },
  childHomeworkModalDate: {
    fontSize: 13,
    color: "#607d8b",
    marginTop: 4,
    marginBottom: 12,
    textTransform: "capitalize",
  },
  childHomeworkPhotoRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  childHomeworkPhotoButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbdefb",
    backgroundColor: "#eef7ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  childHomeworkPhotoText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1565c0",
  },
  childHomeworkInput: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: "#cfd8dc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#263238",
    backgroundColor: "#fafafa",
  },
  helperInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#cfd8dc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#263238",
    backgroundColor: "#fafafa",
  },
  childHomeworkModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  childHomeworkCancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eceff1",
  },
  childHomeworkCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#455a64",
  },
  childHomeworkSaveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196f3",
  },
  childHomeworkSaveButtonDisabled: {
    opacity: 0.5,
  },
  childHomeworkSaveText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
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
