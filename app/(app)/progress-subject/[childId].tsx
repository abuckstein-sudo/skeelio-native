import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Attempt, factTierCoverageGapAfterOtherGates, factTierCoverageKeys, factTierCoverageProgress, isSolidTierStat, tierStats, TierStats } from "@/lib/tutor/ability";
import { getOperationStatus, OperationStatus } from "@/lib/tutor/status";
import {
  gradeExpectedTierId,
  gradeExpectedTierStandard,
  LADDERS,
  Operation,
  tierIndex,
} from "@/lib/tutorConfig";
import { operationLabel, recommendationFor } from "@/lib/progressGlance";
import { createProgressPracticeAssignment, ProgressPracticeTarget } from "@/lib/progressPracticeAssignments";
import { todayDateKey } from "@/lib/schoolHomework";
import {
  CONJUGATION_GRADE_EXPECTED,
  CONJUGATION_GRADE_EXPECTED_STANDARDS,
  CONJUGATION_LADDER,
  ConjugationTierId,
} from "@/lib/conjugationConfig";
import {
  ConjugationAttempt,
  ConjugationTierStats,
  conjugationTierStats,
  currentConjugationTierAndBand,
  isSolidConjugationTier,
} from "@/lib/tutor/conjugationAbility";
import { fetchConjugationAttemptsForChild } from "@/lib/tutor/conjugationAttempts";
import {
  SPELLING_GRADE_EXPECTED,
  SPELLING_LEXICAL_LADDER,
  SpellingTierId,
} from "@/lib/spellingConfig";
import {
  SpellingAttempt,
  SpellingTierStats,
  currentSpellingTierAndBand,
  isSolidSpellingTier,
  spellingTierStats,
} from "@/lib/tutor/spellingAbility";
import { fetchSpellingAttemptsForChild } from "@/lib/tutor/spellingAttempts";

type Child = {
  id: string;
  name: string;
  grade_level?: string | null;
  max_addition_number?: number | null;
  math_subtraction_level?: string | null;
  max_times_table?: number | null;
  math_division_level?: string | null;
};

type LearningAttemptRow = {
  tier: string | null;
  question_text: string | null;
  was_correct: boolean | null;
  ai_hint_used: boolean | null;
  evidence_source: string | null;
  created_at: string | null;
};

type WeeklyBucket = {
  label: string;
  total: number;
  correct: number;
  accuracy: number;
};
type GradeProgressDisplay = {
  displayTargetIndex: number;
  bannerText: string | null;
};

const OPERATIONS: Operation[] = ["addition", "subtraction", "multiplication", "division"];
const GRADE_ORDER = ["CP", "CE1", "CE2", "CM1"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeGradeLevel(gradeLevel: string | null | undefined): string | null {
  if (!gradeLevel) return null;
  const normalized = gradeLevel.trim().toUpperCase().replace(/\s+/g, "");
  return GRADE_ORDER.includes(normalized) ? normalized : null;
}

function toAttempt(row: LearningAttemptRow): Attempt | null {
  if (!row.tier) return null;
  return {
    tierId: row.tier,
    correct: !!row.was_correct,
    hintUsed: !!row.ai_hint_used,
    questionText: row.question_text,
    evidenceSource: row.evidence_source,
  };
}

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatWeekLabel(start: Date): string {
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function nextGradeForOperation(operation: Operation, gradeLevel: string | null | undefined): string | null {
  const startIndex = gradeLevel ? Math.max(0, GRADE_ORDER.indexOf(gradeLevel) + 1) : 0;
  for (let index = startIndex; index < GRADE_ORDER.length; index++) {
    if (gradeExpectedTierId(operation, GRADE_ORDER[index])) return GRADE_ORDER[index];
  }
  return null;
}

function gradeProgressDisplay({
  operation,
  gradeLevel,
  highestSolidIndex,
  targetIndex,
}: {
  operation: Operation;
  gradeLevel?: string | null;
  highestSolidIndex: number;
  targetIndex: number;
}): GradeProgressDisplay {
  if (targetIndex < 0 || highestSolidIndex < targetIndex) {
    return { displayTargetIndex: targetIndex, bannerText: null };
  }

  let highestMetGrade: string | null = null;
  let nextTargetGrade: string | null = null;
  let nextTargetIndex = -1;

  for (const grade of GRADE_ORDER) {
    const gradeTargetIndex = tierIndex(operation, gradeExpectedTierId(operation, grade));
    if (gradeTargetIndex < 0) continue;
    if (highestSolidIndex >= gradeTargetIndex) {
      highestMetGrade = grade;
    } else if (nextTargetGrade === null) {
      nextTargetGrade = grade;
      nextTargetIndex = gradeTargetIndex;
    }
  }

  if (nextTargetGrade) {
    const gradePrefix =
      highestMetGrade && highestMetGrade !== gradeLevel ? `working at ${highestMetGrade} level` : `working toward ${nextTargetGrade} level`;
    return {
      displayTargetIndex: nextTargetIndex,
      bannerText: `Ahead — ${gradePrefix}`,
    };
  }

  return {
    displayTargetIndex: highestSolidIndex,
    bannerText: highestMetGrade ? `Working beyond ${highestMetGrade} level • Top of the ladder` : "Top of the ladder",
  };
}

function buildWeeklyBuckets(rows: LearningAttemptRow[], now = new Date()): WeeklyBucket[] {
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setHours(0, 0, 0, 0);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay());

  return Array.from({ length: 8 }).map((_, index) => {
    const start = new Date(startOfThisWeek.getTime() - (7 - index) * WEEK_MS);
    const end = new Date(start.getTime() + WEEK_MS);
    const bucketRows = rows.filter((row) => {
      if (!row.created_at) return false;
      const date = new Date(row.created_at);
      return !Number.isNaN(date.getTime()) && date >= start && date < end;
    });
    const correct = bucketRows.filter((row) => row.was_correct).length;
    const total = bucketRows.length;
    return {
      label: formatWeekLabel(start),
      total,
      correct,
      accuracy: total > 0 ? correct / total : 0,
    };
  });
}

function tierStateLabel({
  index,
  currentIndex,
  mastered,
}: {
  index: number;
  currentIndex: number;
  mastered: boolean;
}): "mastered" | "current" | "future" {
  if (mastered) return "mastered";
  if (index === currentIndex) return "current";
  return "future";
}

function conjugationExpectedTierId(gradeLevel: string | null | undefined): ConjugationTierId | null {
  return (CONJUGATION_GRADE_EXPECTED as Record<string, ConjugationTierId | null>)[normalizeGradeLevel(gradeLevel) || ""] ?? null;
}

function conjugationTierIndex(tierId: ConjugationTierId | string | null | undefined): number {
  if (!tierId) return -1;
  return CONJUGATION_LADDER.findIndex((tier) => tier.id === tierId);
}

function buildConjugationWeeklyBuckets(attempts: ConjugationAttempt[], now = new Date()): WeeklyBucket[] {
  return buildWeeklyBuckets(attempts.map((attempt) => ({
    tier: null,
    question_text: null,
    was_correct: Boolean(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct),
    ai_hint_used: Boolean(attempt.aided || attempt.hintUsed),
    evidence_source: null,
    created_at: attempt.created_at ?? null,
  })), now);
}

function spellingExpectedTierId(gradeLevel: string | null | undefined): SpellingTierId | null {
  return (SPELLING_GRADE_EXPECTED as Record<string, { lexical: SpellingTierId; invariable: SpellingTierId } | undefined>)[normalizeGradeLevel(gradeLevel) || ""]?.lexical ?? null;
}

function spellingTierIndex(tierId: SpellingTierId | string | null | undefined): number {
  if (!tierId) return -1;
  return SPELLING_LEXICAL_LADDER.findIndex((tier) => tier.id === tierId);
}

function buildSpellingWeeklyBuckets(attempts: SpellingAttempt[], now = new Date()): WeeklyBucket[] {
  return buildWeeklyBuckets(attempts.map((attempt) => ({
    tier: null,
    question_text: null,
    was_correct: Boolean(attempt.wasCorrect ?? attempt.is_correct ?? attempt.correct),
    ai_hint_used: Boolean(attempt.aided || attempt.hintUsed),
    evidence_source: null,
    created_at: attempt.createdAt ?? null,
  })), now);
}

export default function ProgressSubjectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId: string; childName?: string; operation?: string }>();
  const childId = String(params.childId || "");
  const paramChildName = params.childName ? String(params.childName) : "";
  const requestedSubject = String(params.operation || "");
  const isConjugation = requestedSubject === "conjugation";
  const isSpelling = requestedSubject === "spelling";
  const operation = OPERATIONS.includes(requestedSubject as Operation)
    ? (String(params.operation) as Operation)
    : "addition";

  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<Child | null>(null);
  const [status, setStatus] = useState<OperationStatus | null>(null);
  const [attemptRows, setAttemptRows] = useState<LearningAttemptRow[]>([]);
  const [conjugationAttempts, setConjugationAttempts] = useState<ConjugationAttempt[]>([]);
  const [spellingAttempts, setSpellingAttempts] = useState<SpellingAttempt[]>([]);
  const [isAssigningPractice, setIsAssigningPractice] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!childId) return;
      setLoading(true);
      try {
        const { data: childData, error: childError } = await supabase
          .from("children")
          .select("id, name, grade_level, max_addition_number, math_subtraction_level, max_times_table, math_division_level")
          .eq("id", childId)
          .single();

        if (childError) throw childError;

        const loadedChild = childData as Child;
        const [operationStatus, attemptsResult, conjugationRows, spellingRows] = isConjugation
          ? [null, { data: [] }, await fetchConjugationAttemptsForChild(childId), [] as SpellingAttempt[]] as const
          : isSpelling
            ? [null, { data: [] }, [] as ConjugationAttempt[], await fetchSpellingAttemptsForChild(childId)] as const
            : await Promise.all([
              getOperationStatus(childId, operation, loadedChild),
              supabase
                .from("learning_attempts")
                .select("tier, question_text, was_correct, ai_hint_used, evidence_source, created_at")
                .eq("child_id", childId)
                .eq("topic", operation)
                .not("tier", "is", null),
              Promise.resolve([] as ConjugationAttempt[]),
              Promise.resolve([] as SpellingAttempt[]),
            ]);

        if (cancelled) return;
        setChild(loadedChild);
        setStatus(operationStatus);
        setAttemptRows((attemptsResult.data || []) as LearningAttemptRow[]);
        setConjugationAttempts(conjugationRows);
        setSpellingAttempts(spellingRows);
      } catch (error) {
        console.error("[progress-subject] load error:", error);
        if (!cancelled) {
          setChild(null);
          setStatus(null);
          setAttemptRows([]);
          setConjugationAttempts([]);
          setSpellingAttempts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [childId, operation, isConjugation, isSpelling]);

  const attempts = useMemo(() => attemptRows.map(toAttempt).filter(Boolean) as Attempt[], [attemptRows]);
  const stats = useMemo(() => tierStats(attempts), [attempts]);
  const weeklyBuckets = useMemo(() => buildWeeklyBuckets(attemptRows), [attemptRows]);
  const ladder = LADDERS[operation];
  const gradeLevel = normalizeGradeLevel(child?.grade_level) || child?.grade_level || null;
  const targetTierId = gradeExpectedTierId(operation, gradeLevel);
  const targetIndex = tierIndex(operation, targetTierId);
  const targetTier = targetIndex >= 0 ? ladder[targetIndex] : null;
  const currentTierId = status?.workingTierId || ladder[0]?.id;
  const currentTier = ladder.find((tier) => tier.id === currentTierId) || ladder[0];
  const currentIndex = tierIndex(operation, currentTierId);
  const highestSolidIndex = tierIndex(operation, status?.highestSolidTierId);
  const currentStats = currentTier ? stats[currentTier.id] : undefined;
  const currentCoverage = currentTier ? factTierCoverageProgress(currentTier.id, attempts) : null;
  const childName = child?.name || paramChildName || "this child";
  const gradeLabel = gradeLevel || "this grade";
  const standard = gradeExpectedTierStandard(gradeLevel);
  const startsInGrade = targetTierId ? null : nextGradeForOperation(operation, gradeLevel);
  const gradeProgress = gradeProgressDisplay({ operation, gradeLevel, highestSolidIndex, targetIndex });
  const targetPillText = gradeProgress.bannerText ? "next goal" : "year goal";
  const gradeBannerText = targetTier
    ? gradeProgress.bannerText
      ? gradeProgress.bannerText
      : `${gradeLabel} year goal: ${targetTier.label}`
    : startsInGrade
      ? `Starts in ${startsInGrade}`
      : "No year goal set for this grade";
  const highestSolidText = status?.highestSolidTierLabel
    ? `Highest solid: ${status.highestSolidTierLabel}`
    : "Highest solid: not yet";
  const recommendation = recommendationFor(
    operation,
    currentTier?.label || operationLabel(operation),
    status?.band || "needs-teach",
    currentCoverage && currentCoverage.covered < currentCoverage.required
      ? { missingFacts: [`${currentCoverage.required - currentCoverage.covered} facts left`] }
      : null
  );
  const maxWeeklyTotal = Math.max(1, ...weeklyBuckets.map((bucket) => bucket.total));
  const conjugationStats = useMemo(() => conjugationTierStats(conjugationAttempts), [conjugationAttempts]);
  const conjugationBand = useMemo(() => currentConjugationTierAndBand(conjugationAttempts), [conjugationAttempts]);
  const conjugationWeeklyBuckets = useMemo(() => buildConjugationWeeklyBuckets(conjugationAttempts), [conjugationAttempts]);
  const conjugationCurrentTier = CONJUGATION_LADDER.find((tier) => tier.id === conjugationBand.tierId) || CONJUGATION_LADDER[0];
  const conjugationCurrentStats = conjugationStats[conjugationCurrentTier.id];
  const conjugationTargetTierId = conjugationExpectedTierId(gradeLevel);
  const conjugationTargetIndex = conjugationTierIndex(conjugationTargetTierId);
  const conjugationTargetTier = conjugationTargetIndex >= 0 ? CONJUGATION_LADDER[conjugationTargetIndex] : null;
  const conjugationStandard = (CONJUGATION_GRADE_EXPECTED_STANDARDS as Record<string, { citation: string } | undefined>)[normalizeGradeLevel(gradeLevel) || ""];
  const conjugationHighestSolidIndex = useMemo(() => {
    for (let index = CONJUGATION_LADDER.length - 1; index >= 0; index--) {
      if (isSolidConjugationTier(conjugationStats[CONJUGATION_LADDER[index].id])) return index;
    }
    return -1;
  }, [conjugationStats]);
  const conjugationMaxWeeklyTotal = Math.max(1, ...conjugationWeeklyBuckets.map((bucket) => bucket.total));
  const conjugationBannerText = conjugationTargetTier
    ? `${gradeLabel} year goal: ${conjugationTargetTier.label}`
    : "No year goal set for this grade";
  const conjugationHighestSolidText = conjugationHighestSolidIndex >= 0
    ? `Highest solid: ${CONJUGATION_LADDER[conjugationHighestSolidIndex].label}`
    : "Highest solid: not yet";
  const conjugationRecommendation = `Keep practicing ${conjugationCurrentTier.label} across all six pronouns.`;
  const spellingStats = useMemo(() => spellingTierStats(spellingAttempts), [spellingAttempts]);
  const spellingBand = useMemo(() => currentSpellingTierAndBand(spellingAttempts).lexical, [spellingAttempts]);
  const spellingWeeklyBuckets = useMemo(() => buildSpellingWeeklyBuckets(spellingAttempts), [spellingAttempts]);
  const spellingCurrentTier = SPELLING_LEXICAL_LADDER.find((tier) => tier.id === spellingBand.tierId) || SPELLING_LEXICAL_LADDER[0];
  const spellingTargetTierId = spellingExpectedTierId(gradeLevel);
  const spellingTargetIndex = spellingTierIndex(spellingTargetTierId);
  const spellingTargetTier = spellingTargetIndex >= 0 ? SPELLING_LEXICAL_LADDER[spellingTargetIndex] : null;
  const spellingHighestSolidIndex = useMemo(() => {
    for (let index = SPELLING_LEXICAL_LADDER.length - 1; index >= 0; index--) {
      if (isSolidSpellingTier(spellingStats[SPELLING_LEXICAL_LADDER[index].id])) return index;
    }
    return -1;
  }, [spellingStats]);
  const spellingMaxWeeklyTotal = Math.max(1, ...spellingWeeklyBuckets.map((bucket) => bucket.total));
  const spellingBannerText = spellingTargetTier
    ? `${gradeLabel} year goal: ${spellingTargetTier.label}`
    : "No year goal set for this grade";
  const spellingHighestSolidText = spellingHighestSolidIndex >= 0
    ? `Highest solid: ${SPELLING_LEXICAL_LADDER[spellingHighestSolidIndex].label}`
    : "Highest solid: not yet";
  const spellingRecommendation = `Keep practicing ${spellingCurrentTier.label} until enough distinct words are correct unaided.`;

  const goBackToChildProgress = () => {
    router.replace({
      pathname: "/(app)/parent" as any,
      params: {
        childId,
        childName,
        tab: "progress",
      },
    });
  };

  const missingFactLabelsForTier = (tierId: string) => {
    const keys = factTierCoverageKeys(tierId, attempts);
    if (!keys) return [];
    const covered = new Set(keys.covered);
    return keys.required.filter((key) => !covered.has(key));
  };

  const progressAssignmentTarget = (): ProgressPracticeTarget => {
    if (isConjugation) {
      return {
        subject: "conjugation",
        tierId: conjugationCurrentTier.id,
        tierLabel: conjugationCurrentTier.label,
      };
    }

    if (isSpelling) {
      return {
        subject: "spelling",
        tierId: spellingCurrentTier.id,
        tierLabel: spellingCurrentTier.label,
      };
    }

    if (status?.band === "struggling") {
      return {
        subject: "math",
        operation,
        tierId: status.workingTierId,
        tierLabel: status.workingTierLabel,
      };
    }

    for (const tier of ladder) {
      const gap = factTierCoverageGapAfterOtherGates(tier.id, attempts);
      if (!gap) continue;
      return {
        subject: "math",
        operation,
        tierId: tier.id,
        tierLabel: tier.label,
        missingFacts: missingFactLabelsForTier(tier.id),
      };
    }

    return {
      subject: "math",
      operation,
      tierId: currentTierId,
      tierLabel: currentTier?.label,
    };
  };

  const openAssign = async () => {
    if (isAssigningPractice) return;
    setIsAssigningPractice(true);
    try {
      const result = await createProgressPracticeAssignment(childId, progressAssignmentTarget(), todayDateKey());
      Alert.alert("Added to today's agenda", result.taskText);
      router.replace({
        pathname: "/(app)/parent" as any,
        params: {
          childId,
          childName,
          tab: "today",
        },
      });
    } catch (err) {
      console.error("[progress-subject] direct assignment error:", err);
      Alert.alert("Could not add practice", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setIsAssigningPractice(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  if (isConjugation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={goBackToChildProgress}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Conjugation</Text>
            <Text style={styles.headerSubtitle}>{childName}</Text>
          </View>
          <View style={styles.headerButton}>
            <MaterialCommunityIcons name="format-letter-case" size={21} color="#0f766e" />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.gradeBanner}>
            <Text style={styles.gradeTitle}>{conjugationBannerText}</Text>
            <Text style={styles.gradeMeta}>{conjugationHighestSolidText}</Text>
            <Text style={styles.sourceText}>Source: {conjugationStandard?.citation || "Grade target source unavailable."}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tier ladder</Text>
            <View style={styles.ladder}>
              {CONJUGATION_LADDER.slice(0, conjugationTargetIndex >= 0 ? conjugationTargetIndex + 1 : CONJUGATION_LADDER.length).map((tier, index) => {
                const stat = conjugationStats[tier.id];
                const mastered = isSolidConjugationTier(stat);
                const current = tier.id === conjugationBand.tierId && !mastered;
                const state = mastered ? "mastered" : current ? "current" : "future";
                return (
                  <View key={tier.id} style={[styles.tierRow, state === "current" && styles.tierRowCurrent]}>
                    <View style={[styles.tierDot, styles[`tierDot_${state}`]]} />
                    <View style={styles.tierTextWrap}>
                      <View style={styles.tierTitleRow}>
                        <Text style={styles.tierTitle}>{tier.id} · {tier.label}</Text>
                        {index === conjugationTargetIndex ? <Text style={styles.targetPill}>year goal</Text> : null}
                      </View>
                      <Text style={styles.tierState}>{state}</Text>
                      {state === "current" ? <ConjugationTierStatsLine stat={stat} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accuracy over time</Text>
            <View style={styles.weeklyPanel}>
              {conjugationWeeklyBuckets.map((bucket) => (
                <View key={bucket.label} style={styles.weekItem}>
                  <View style={styles.weekTrack}>
                    <View
                      style={[
                        styles.weekVolume,
                        { height: `${Math.max(10, (bucket.total / conjugationMaxWeeklyTotal) * 100)}%` },
                      ]}
                    >
                      <View style={[styles.weekAccuracy, { height: `${bucket.accuracy * 100}%` }]} />
                    </View>
                  </View>
                  <Text style={styles.weekLabel}>{bucket.label}</Text>
                  <Text style={styles.weekRate}>{bucket.total > 0 ? percent(bucket.accuracy * 100) : "—"}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.nextPanel}>
            <View style={styles.nextTextWrap}>
              <Text style={styles.sectionTitle}>What to do next</Text>
              <Text style={styles.recommendation}>{conjugationRecommendation}</Text>
            </View>
            <TouchableOpacity style={[styles.assignButton, isAssigningPractice && styles.assignButtonDisabled]} onPress={openAssign} disabled={isAssigningPractice}>
              {isAssigningPractice ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="playlist-plus" size={17} color="#fff" />
              )}
              <Text style={styles.assignButtonText}>{isAssigningPractice ? "Adding..." : "Assign practice"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isSpelling) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={goBackToChildProgress}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Spelling</Text>
            <Text style={styles.headerSubtitle}>{childName}</Text>
          </View>
          <View style={styles.headerButton}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={21} color="#7c3aed" />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.gradeBanner}>
            <Text style={styles.gradeTitle}>{spellingBannerText}</Text>
            <Text style={styles.gradeMeta}>{spellingHighestSolidText}</Text>
            <Text style={styles.sourceText}>Source: Échelle orthographique Dubois-Buyse</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tier ladder</Text>
            <View style={styles.ladder}>
              {SPELLING_LEXICAL_LADDER.slice(0, spellingTargetIndex >= 0 ? spellingTargetIndex + 1 : SPELLING_LEXICAL_LADDER.length).map((tier, index) => {
                const stat = spellingStats[tier.id];
                const mastered = isSolidSpellingTier(stat);
                const current = tier.id === spellingBand.tierId && !mastered;
                const state = mastered ? "mastered" : current ? "current" : "future";
                return (
                  <View key={tier.id} style={[styles.tierRow, state === "current" && styles.tierRowCurrent]}>
                    <View style={[styles.tierDot, styles[`tierDot_${state}`]]} />
                    <View style={styles.tierTextWrap}>
                      <View style={styles.tierTitleRow}>
                        <Text style={styles.tierTitle}>{tier.id} · {tier.label}</Text>
                        {index === spellingTargetIndex ? <Text style={styles.targetPill}>year goal</Text> : null}
                      </View>
                      <Text style={styles.tierState}>{state}</Text>
                      {state === "current" ? <SpellingTierStatsLine stat={stat} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accuracy over time</Text>
            <View style={styles.weeklyPanel}>
              {spellingWeeklyBuckets.map((bucket) => (
                <View key={bucket.label} style={styles.weekItem}>
                  <View style={styles.weekTrack}>
                    <View
                      style={[
                        styles.weekVolume,
                        { height: `${Math.max(10, (bucket.total / spellingMaxWeeklyTotal) * 100)}%` },
                      ]}
                    >
                      <View style={[styles.weekAccuracy, { height: `${bucket.accuracy * 100}%` }]} />
                    </View>
                  </View>
                  <Text style={styles.weekLabel}>{bucket.label}</Text>
                  <Text style={styles.weekRate}>{bucket.total > 0 ? percent(bucket.accuracy * 100) : "—"}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.nextPanel}>
            <View style={styles.nextTextWrap}>
              <Text style={styles.sectionTitle}>What to do next</Text>
              <Text style={styles.recommendation}>{spellingRecommendation}</Text>
            </View>
            <TouchableOpacity style={[styles.assignButton, isAssigningPractice && styles.assignButtonDisabled]} onPress={openAssign} disabled={isAssigningPractice}>
              {isAssigningPractice ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="playlist-plus" size={17} color="#fff" />
              )}
              <Text style={styles.assignButtonText}>{isAssigningPractice ? "Adding..." : "Assign practice"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={goBackToChildProgress}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{operationLabel(operation)}</Text>
          <Text style={styles.headerSubtitle}>{childName}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={openAssign}>
          <MaterialCommunityIcons name="playlist-plus" size={21} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gradeBanner}>
          <Text style={styles.gradeTitle}>{gradeBannerText}</Text>
          <Text style={styles.gradeMeta}>{highestSolidText}</Text>
          <Text style={styles.sourceText}>Source: {standard?.citation || "Grade target source unavailable."}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tier ladder</Text>
          <View style={styles.ladder}>
            {ladder.map((tier, index) => {
              const stat = stats[tier.id];
              const mastered = isSolidTierStat(stat);
              const state = tierStateLabel({ index, currentIndex, mastered });
              const isTarget = index === gradeProgress.displayTargetIndex;
              return (
                <View key={tier.id} style={[styles.tierRow, state === "current" && styles.tierRowCurrent]}>
                  <View style={[styles.tierDot, styles[`tierDot_${state}`]]} />
                  <View style={styles.tierTextWrap}>
                    <View style={styles.tierTitleRow}>
                      <Text style={styles.tierTitle}>{tier.id} · {tier.label}</Text>
                      {isTarget ? <Text style={styles.targetPill}>{targetPillText}</Text> : null}
                    </View>
                    <Text style={styles.tierState}>{state}</Text>
                    {state === "current" ? <TierStatsLine stat={stat} coverage={factTierCoverageProgress(tier.id, attempts)} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accuracy over time</Text>
          <View style={styles.weeklyPanel}>
            {weeklyBuckets.map((bucket) => (
              <View key={bucket.label} style={styles.weekItem}>
                <View style={styles.weekTrack}>
                  <View
                    style={[
                      styles.weekVolume,
                      { height: `${Math.max(10, (bucket.total / maxWeeklyTotal) * 100)}%` },
                    ]}
                  >
                    <View style={[styles.weekAccuracy, { height: `${bucket.accuracy * 100}%` }]} />
                  </View>
                </View>
                <Text style={styles.weekLabel}>{bucket.label}</Text>
                <Text style={styles.weekRate}>{bucket.total > 0 ? percent(bucket.accuracy * 100) : "—"}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.nextPanel}>
          <View style={styles.nextTextWrap}>
            <Text style={styles.sectionTitle}>What to do next</Text>
            <Text style={styles.recommendation}>{recommendation}</Text>
          </View>
          <TouchableOpacity style={[styles.assignButton, isAssigningPractice && styles.assignButtonDisabled]} onPress={openAssign} disabled={isAssigningPractice}>
            {isAssigningPractice ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="playlist-plus" size={17} color="#fff" />
            )}
            <Text style={styles.assignButtonText}>{isAssigningPractice ? "Adding..." : "Assign practice"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TierStatsLine({ stat, coverage }: { stat?: TierStats; coverage: { covered: number; required: number } | null }) {
  if (!stat) {
    return <Text style={styles.tierStats}>No attempts yet</Text>;
  }

  const coverageText = coverage ? ` • coverage ${coverage.covered}/${coverage.required}` : "";
  return (
    <Text style={styles.tierStats}>
      {percent(stat.masteryRate * 100)} accuracy • {stat.attempts} attempts{coverageText}
    </Text>
  );
}

function ConjugationTierStatsLine({ stat }: { stat?: ConjugationTierStats }) {
  if (!stat) {
    return <Text style={styles.tierStats}>No attempts yet</Text>;
  }

  return (
    <Text style={styles.tierStats}>
      {percent(stat.masteryRate * 100)} accuracy • {stat.unaidedCorrect}/{stat.unaidedAttempts} unaided correct • pronouns {stat.pronounsCovered.length}/6 • verbs {stat.distinctVerbsCovered}
    </Text>
  );
}

function SpellingTierStatsLine({ stat }: { stat?: SpellingTierStats }) {
  if (!stat) {
    return <Text style={styles.tierStats}>No attempts yet</Text>;
  }

  return (
    <Text style={styles.tierStats}>
      {percent(stat.masteryRate * 100)} accuracy • {stat.unaidedCorrect}/{stat.unaidedAttempts} unaided correct • words {stat.distinctWordsCovered}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "capitalize",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  content: {
    padding: 16,
    gap: 14,
  },
  gradeBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 14,
    gap: 6,
  },
  gradeTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    color: "#1e3a8a",
  },
  gradeMeta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  sourceText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  ladder: {
    gap: 8,
  },
  tierRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    padding: 12,
  },
  tierRowCurrent: {
    borderColor: "#93c5fd",
    backgroundColor: "#f8fbff",
  },
  tierDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  tierDot_mastered: {
    backgroundColor: "#22c55e",
  },
  tierDot_current: {
    backgroundColor: "#2563eb",
  },
  tierDot_future: {
    backgroundColor: "#cbd5e1",
  },
  tierTextWrap: {
    flex: 1,
    gap: 3,
  },
  tierTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  tierTitle: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  targetPill: {
    borderRadius: 8,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
    color: "#1d4ed8",
    textTransform: "uppercase",
  },
  tierState: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "capitalize",
  },
  tierStats: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#475569",
  },
  weeklyPanel: {
    minHeight: 138,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
  },
  weekItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  weekTrack: {
    width: "100%",
    height: 72,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  weekVolume: {
    width: "100%",
    backgroundColor: "#bfdbfe",
    justifyContent: "flex-end",
  },
  weekAccuracy: {
    width: "100%",
    backgroundColor: "#2563eb",
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  weekRate: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
  },
  nextPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    padding: 14,
    gap: 12,
  },
  nextTextWrap: {
    gap: 6,
  },
  recommendation: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#166534",
  },
  assignButton: {
    minHeight: 42,
    alignSelf: "flex-start",
    borderRadius: 8,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
  },
  assignButtonDisabled: {
    opacity: 0.65,
  },
  assignButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
});
