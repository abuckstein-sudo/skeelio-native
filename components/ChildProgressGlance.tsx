import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Attempt, factTierCoverageGapAfterOtherGates, factTierCoverageKeys, isSolidTierStat, tierStats } from "@/lib/tutor/ability";
import { getOperationStatus, OperationStatus } from "@/lib/tutor/status";
import { computeUnlockState, SubjectUnlockState } from "@/lib/tutor/unlockGraph";
import {
  gradeExpectedTierId,
  gradeExpectedTierStandard,
  LADDERS,
  Operation,
  tierIndex,
} from "@/lib/tutorConfig";
import { listWorksheetSkillsForChild, worksheetSkillLabel, WorksheetSkill } from "@/lib/worksheetSkills";
import { operationLabel, recommendationFor } from "@/lib/progressGlance";
import { todayDateKey } from "@/lib/schoolHomework";
import {
  CONJUGATION_GRADE_EXPECTED,
  CONJUGATION_GRADE_EXPECTED_STANDARDS,
  CONJUGATION_LADDER,
  ConjugationTierId,
} from "@/lib/conjugationConfig";
import {
  ConjugationAttempt,
  conjugationTierStats,
  currentConjugationTierAndBand,
  isSolidConjugationTier,
} from "@/lib/tutor/conjugationAbility";
import { fetchConjugationAttemptsForChild } from "@/lib/tutor/conjugationAttempts";

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
  topic: string | null;
  tier: string | null;
  question_text: string | null;
  was_correct: boolean | null;
  ai_hint_used: boolean | null;
  evidence_source: string | null;
  created_at: string | null;
};

type StuckCard =
  | {
      id: string;
      kind: "struggling";
      operation: Operation;
      tierId: string;
      tierLabel: string;
      attemptCount: number;
      accuracy: number;
      recommendation: string;
    }
  | {
      id: string;
      kind: "coverage";
      operation: Operation;
      tierId: string;
      tierLabel: string;
      missingFacts: string[];
      recommendation: string;
    }
  | {
      id: string;
      kind: "conjugation-struggling";
      tierId: ConjugationTierId;
      tierLabel: string;
      attemptCount: number;
      accuracy: number;
      recommendation: string;
    };

type RecentWin = {
  id: string;
  title: string;
  detail: string;
  date: Date;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

type Timeframe = "7d" | "30d" | "all";
type ChecklistSelection = {
  type: "math";
  operation: Operation;
  status?: OperationStatus;
} | {
  type: "conjugation";
  attempts: ConjugationAttempt[];
};
type GradeProgressDisplay = {
  displayTargetIndex: number;
  statusText: string | null;
};

const MATH_OPERATIONS: Operation[] = ["addition", "subtraction", "multiplication", "division"];
const GRADE_ORDER = ["CP", "CE1", "CE2", "CM1"];
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEFRAME_OPTIONS: Array<{ id: Timeframe | "custom"; label: string }> = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

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

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeframeLabel(timeframe: Timeframe): string {
  if (timeframe === "7d") return "last 7 days";
  if (timeframe === "30d") return "last 30 days";
  return "all time";
}

function dateFromString(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateForWorksheetSkill(skill: WorksheetSkill): Date | null {
  return dateFromString(skill.completed_at || skill.created_at);
}

function timeframeStart(timeframe: Timeframe, now: Date, dates: Date[]): Date | null {
  if (timeframe === "7d") return new Date(now.getTime() - 6 * DAY_MS);
  if (timeframe === "30d") return new Date(now.getTime() - 29 * DAY_MS);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function isWithinTimeframe(date: Date | null, start: Date | null, now: Date): boolean {
  if (!date) return false;
  if (date > now) return false;
  return !start || date >= start;
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
  highestIndex,
  targetIndex,
}: {
  operation: Operation;
  gradeLevel?: string | null;
  highestIndex: number;
  targetIndex: number;
}): GradeProgressDisplay {
  if (targetIndex < 0 || highestIndex < targetIndex) {
    return { displayTargetIndex: targetIndex, statusText: null };
  }

  let highestMetGrade: string | null = null;
  let nextTargetGrade: string | null = null;
  let nextTargetIndex = -1;

  for (const grade of GRADE_ORDER) {
    const gradeTargetIndex = tierIndex(operation, gradeExpectedTierId(operation, grade));
    if (gradeTargetIndex < 0) continue;
    if (highestIndex >= gradeTargetIndex) {
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
      statusText: `Ahead — ${gradePrefix}`,
    };
  }

  return {
    displayTargetIndex: highestIndex,
    statusText: highestMetGrade ? `Working beyond ${highestMetGrade} level • Top of the ladder` : "Top of the ladder",
  };
}

function conjugationExpectedTierId(gradeLevel: string | null | undefined): ConjugationTierId | null {
  return (CONJUGATION_GRADE_EXPECTED as Record<string, ConjugationTierId | null>)[gradeLevel || ""] ?? null;
}

function conjugationTierIndex(tierId: ConjugationTierId | string | null | undefined): number {
  if (!tierId) return -1;
  return CONJUGATION_LADDER.findIndex((tier) => tier.id === tierId);
}

function nextConjugationGrade(gradeLevel: string | null | undefined): string | null {
  const startIndex = gradeLevel ? Math.max(0, GRADE_ORDER.indexOf(gradeLevel) + 1) : 0;
  for (let index = startIndex; index < GRADE_ORDER.length; index++) {
    if (conjugationExpectedTierId(GRADE_ORDER[index])) return GRADE_ORDER[index];
  }
  return null;
}

function conjugationGradeProgressDisplay({
  gradeLevel,
  highestIndex,
  targetIndex,
}: {
  gradeLevel?: string | null;
  highestIndex: number;
  targetIndex: number;
}): GradeProgressDisplay {
  if (targetIndex < 0 || highestIndex < targetIndex) {
    return { displayTargetIndex: targetIndex, statusText: null };
  }

  const nextTarget = CONJUGATION_LADDER.find((_, index) => index > highestIndex);
  if (nextTarget) {
    return {
      displayTargetIndex: conjugationTierIndex(nextTarget.id),
      statusText: `Ahead — working beyond ${gradeLevel || "grade"} level`,
    };
  }

  return {
    displayTargetIndex: highestIndex,
    statusText: "Working beyond CM1 level • Top of the ladder",
  };
}

function highestSolidConjugationIndex(attempts: ConjugationAttempt[]): number {
  const stats = conjugationTierStats(attempts);
  for (let index = CONJUGATION_LADDER.length - 1; index >= 0; index--) {
    if (isSolidConjugationTier(stats[CONJUGATION_LADDER[index].id])) return index;
  }
  return -1;
}

function conjugationRecommendation(tierLabel: string, band: string): string {
  if (band === "struggling") return `Replay a short model, then assign mixed pronoun practice for ${tierLabel}.`;
  if (band === "developing") return `Keep practicing ${tierLabel} with all six pronouns.`;
  return `Introduce the next conjugation pattern when the current tier feels steady.`;
}

function missingFactLabels(tierId: string, attempts: Attempt[]): string[] {
  const keys = factTierCoverageKeys(tierId, attempts);
  if (!keys) return [];
  const covered = new Set(keys.covered);
  return keys.required.filter((key) => !covered.has(key));
}

function firstSolidDate(tierId: string, rows: LearningAttemptRow[]): Date | null {
  const sorted = rows
    .filter((row) => row.tier === tierId && row.created_at)
    .sort((a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime());

  for (let i = 0; i < sorted.length; i++) {
    const attempts = sorted.slice(0, i + 1).map(toAttempt).filter(Boolean) as Attempt[];
    if (isSolidTierStat(tierStats(attempts)[tierId])) {
      return new Date(sorted[i].created_at || "");
    }
  }
  return null;
}

function masteryEvents(rows: LearningAttemptRow[]): RecentWin[] {
  const wins: RecentWin[] = [];
  for (const operation of MATH_OPERATIONS) {
    const operationRows = rows.filter((row) => row.topic === operation);
    for (const tier of LADDERS[operation]) {
      const date = firstSolidDate(tier.id, operationRows);
      if (!date) continue;
      wins.push({
        id: `${operation}-${tier.id}`,
        title: `${operationLabel(operation)}: ${tier.label}`,
        detail: "Tier mastered",
        date,
        icon: "medal-outline",
      });
    }
  }
  return wins;
}

function trendBuckets(events: RecentWin[], timeframe: Timeframe, now: Date, rangeStart: Date | null) {
  if (timeframe === "7d") {
    return Array.from({ length: 7 }).map((_, index) => {
      const start = new Date(now.getTime() - (6 - index) * DAY_MS);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + DAY_MS);
      const count = events.filter((event) => event.date >= start && event.date < end).length;
      return { label: start.toLocaleDateString("en-US", { weekday: "short" }), count };
    });
  }

  if (timeframe === "30d") {
    const startBase = rangeStart || new Date(now.getTime() - 29 * DAY_MS);
    return Array.from({ length: 5 }).map((_, index) => {
      const start = new Date(startBase.getTime() + index * 6 * DAY_MS);
      const end = index === 4 ? new Date(now.getTime() + DAY_MS) : new Date(start.getTime() + 6 * DAY_MS);
      const count = events.filter((event) => event.date >= start && event.date < end).length;
      return { label: formatShortDate(start), count };
    });
  }

  const start = rangeStart || now;
  const firstMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCount = Math.max(
    1,
    (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12 + lastMonth.getMonth() - firstMonth.getMonth() + 1
  );
  const visibleMonthCount = Math.min(monthCount, 12);
  return Array.from({ length: visibleMonthCount }).map((_, index) => {
    const monthOffset = monthCount - visibleMonthCount + index;
    const start = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + monthOffset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const count = events.filter((event) => event.date >= start && event.date < end).length;
    return { label: start.toLocaleDateString("en-US", { month: "short" }), count };
  });
}

function buildStuckCards(statuses: OperationStatus[], rows: LearningAttemptRow[], conjugationAttempts: ConjugationAttempt[]): StuckCard[] {
  const cards: StuckCard[] = [];

  for (const status of statuses) {
    if (status.band !== "struggling") continue;
    const attempts = rows
      .filter((row) => row.topic === status.operation)
      .map(toAttempt)
      .filter(Boolean) as Attempt[];
    const stat = tierStats(attempts)[status.workingTierId];
    cards.push({
      id: `struggling-${status.operation}-${status.workingTierId}`,
      kind: "struggling",
      operation: status.operation,
      tierId: status.workingTierId,
      tierLabel: status.workingTierLabel,
      attemptCount: stat?.attempts || 0,
      accuracy: stat ? stat.masteryRate * 100 : 0,
      recommendation: recommendationFor(status.operation, status.workingTierLabel, "struggling", null),
    });
  }

  for (const operation of MATH_OPERATIONS) {
    const attempts = rows
      .filter((row) => row.topic === operation)
      .map(toAttempt)
      .filter(Boolean) as Attempt[];
    for (const tier of LADDERS[operation]) {
      if (cards.some((card) => card.kind !== "conjugation-struggling" && card.operation === operation && card.tierId === tier.id)) continue;
      const gap = factTierCoverageGapAfterOtherGates(tier.id, attempts);
      if (!gap) continue;
      const missingFacts = missingFactLabels(tier.id, attempts);
      cards.push({
        id: `coverage-${operation}-${tier.id}`,
        kind: "coverage",
        operation,
        tierId: tier.id,
        tierLabel: tier.label,
        missingFacts,
        recommendation: recommendationFor(operation, tier.label, "developing", { missingFacts }),
      });
    }
  }

  const conjugationBand = currentConjugationTierAndBand(conjugationAttempts);
  if (conjugationBand.band === "struggling") {
    const stats = conjugationTierStats(conjugationAttempts);
    const stat = stats[conjugationBand.tierId];
    const tierLabel = CONJUGATION_LADDER.find((tier) => tier.id === conjugationBand.tierId)?.label || conjugationBand.tierId;
    cards.push({
      id: `struggling-conjugation-${conjugationBand.tierId}`,
      kind: "conjugation-struggling",
      tierId: conjugationBand.tierId,
      tierLabel,
      attemptCount: stat?.attempts || 0,
      accuracy: stat ? stat.masteryRate * 100 : 0,
      recommendation: conjugationRecommendation(tierLabel, "struggling"),
    });
  }

  return cards.slice(0, 3);
}

export default function ChildProgressGlance({ child }: { child: Child }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [statuses, setStatuses] = useState<OperationStatus[]>([]);
  const [attemptRows, setAttemptRows] = useState<LearningAttemptRow[]>([]);
  const [worksheetSkills, setWorksheetSkills] = useState<WorksheetSkill[]>([]);
  const [conjugationAttempts, setConjugationAttempts] = useState<ConjugationAttempt[]>([]);
  const [spellingListCount, setSpellingListCount] = useState(0);
  const [stars, setStars] = useState(0);
  const [checklistSelection, setChecklistSelection] = useState<ChecklistSelection | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [operationStatuses, attemptsResult, rewardsResult, skills, spellingResult, conjugationRows] = await Promise.all([
          Promise.all(MATH_OPERATIONS.map((operation) => getOperationStatus(child.id, operation, child))),
          supabase
            .from("learning_attempts")
            .select("topic, tier, question_text, was_correct, ai_hint_used, evidence_source, created_at")
            .eq("child_id", child.id)
            .not("tier", "is", null),
          supabase.from("rewards").select("stars").eq("child_id", child.id).maybeSingle(),
          listWorksheetSkillsForChild(child.id),
          supabase.from("spelling_lists").select("id", { count: "exact", head: true }).eq("child_id", child.id),
          fetchConjugationAttemptsForChild(child.id),
        ]);

        if (cancelled) return;
        setStatuses(operationStatuses);
        setAttemptRows((attemptsResult.data || []) as LearningAttemptRow[]);
        setStars(rewardsResult.data?.stars ?? 0);
        setWorksheetSkills(skills);
        setSpellingListCount(spellingResult.count ?? 0);
        setConjugationAttempts(conjugationRows);
      } catch (error) {
        console.error("[progress-glance] load error:", error);
        if (!cancelled) {
          setStatuses([]);
          setAttemptRows([]);
          setWorksheetSkills([]);
          setSpellingListCount(0);
          setConjugationAttempts([]);
          setStars(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [child.id]);

  const now = useMemo(() => new Date(), [attemptRows.length]);
  const mathMasteryEvents = useMemo(() => masteryEvents(attemptRows), [attemptRows]);
  const allActivityDates = [
    ...attemptRows.map((row) => dateFromString(row.created_at)).filter(Boolean),
    ...conjugationAttempts.map((attempt) => dateFromString(attempt.created_at)).filter(Boolean),
    ...worksheetSkills.map(dateForWorksheetSkill).filter(Boolean),
    ...mathMasteryEvents.map((event) => event.date),
  ] as Date[];
  const selectedStart = timeframeStart(timeframe, now, allActivityDates);
  const selectedAttemptRows = attemptRows.filter((row) => isWithinTimeframe(dateFromString(row.created_at), selectedStart, now));
  const correctInWindow = selectedAttemptRows.filter((row) => row.was_correct).length;
  const correctRate = selectedAttemptRows.length > 0 ? (correctInWindow / selectedAttemptRows.length) * 100 : 0;
  const masteredInWindow = mathMasteryEvents.filter((event) => isWithinTimeframe(event.date, selectedStart, now)).length;
  const trends = trendBuckets(mathMasteryEvents, timeframe, now, selectedStart);
  const maxTrend = Math.max(1, ...trends.map((trend) => trend.count));
  const stuckCards = buildStuckCards(statuses, attemptRows, conjugationAttempts);
  const windowLabel = timeframeLabel(timeframe);
  const worksheetActivity = worksheetSkills.filter((skill) => {
    if (skill.status !== "complete") return false;
    return isWithinTimeframe(dateForWorksheetSkill(skill), selectedStart, now);
  });
  const worksheetSkillLabels = Array.from(new Set(worksheetActivity.map(worksheetSkillLabel))).slice(0, 8);

  const openAssignFlow = (operation: Operation, tierId: string) => {
    router.push({
      pathname: "/(app)/assign",
      params: {
        childId: child.id,
        childName: child.name,
        topic: operation,
        tierId,
        homeworkDate: todayDateKey(),
        openAssignment: "1",
      },
    });
  };

  const openSubjectDetail = (operation: Operation) => {
    router.push({
      pathname: "/(app)/progress-subject/[childId]",
      params: {
        childId: child.id,
        childName: child.name,
        operation,
      },
    });
  };
  const openConjugationDetail = () => {
    router.push({
      pathname: "/(app)/progress-subject/[childId]",
      params: {
        childId: child.id,
        childName: child.name,
        operation: "conjugation",
      },
    });
  };

  const highestSolidTierByOperation = MATH_OPERATIONS.reduce((acc, operation) => {
    const status = statuses.find((item) => item.operation === operation);
    acc[operation] = status?.highestSolidTierId || null;
    return acc;
  }, {} as Record<Operation, string | null>);
  const unlockState = computeUnlockState(highestSolidTierByOperation, child);

  const recentWins = useMemo(() => {
    const worksheetWins: RecentWin[] = worksheetSkills
      .filter((skill) => skill.status === "complete" && (skill.completed_at || skill.created_at))
      .map((skill) => ({
        id: `worksheet-${skill.id}`,
        title: worksheetSkillLabel(skill),
        detail: skill.mastered ? "Worksheet skill mastered" : "Worksheet practice completed",
        date: new Date(skill.completed_at || skill.created_at),
        icon: skill.mastered ? "check-decagram-outline" : "file-check-outline",
      }));

    return [...mathMasteryEvents, ...worksheetWins]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);
  }, [mathMasteryEvents, worksheetSkills]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.timeframeSelector}>
        {TIMEFRAME_OPTIONS.map((option) => {
          const selected = option.id === timeframe;
          const disabled = option.id === "custom";
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.timeframeChip,
                selected && styles.timeframeChipActive,
                disabled && styles.timeframeChipDisabled,
              ]}
              onPress={() => {
                // TODO: Wire Custom to DatePickerModal when custom range selection is in scope.
                if (option.id === "custom") return;
                setTimeframe(option.id);
              }}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.timeframeChipText,
                  selected && styles.timeframeChipTextActive,
                  disabled && styles.timeframeChipTextDisabled,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.momentumStrip}>
        <MetricTile label={`Tiers — ${windowLabel}`} value={String(masteredInWindow)} tone="green" />
        <MetricTile label={`Practices — ${windowLabel}`} value={String(selectedAttemptRows.length)} tone="blue" />
        <MetricTile label={`Correct — ${windowLabel}`} value={percent(correctRate)} tone="violet" />
      </View>

      <View style={styles.trendPanel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mastery trend</Text>
          <Text style={styles.sectionMeta}>new tiers</Text>
        </View>
        <View style={styles.trendBars}>
          {trends.map((trend) => (
            <View key={trend.label} style={styles.trendItem}>
              <View style={styles.trendTrack}>
                <View style={[styles.trendFill, { height: `${Math.max(12, (trend.count / maxTrend) * 100)}%` }]} />
              </View>
              <Text style={styles.trendCount}>{trend.count}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{`Where ${child.name}'s stuck`}</Text>
        {stuckCards.length === 0 ? (
          <View style={styles.emptyGood}>
            <MaterialCommunityIcons name="check-circle-outline" size={26} color="#16a34a" />
            <Text style={styles.emptyGoodText}>{`${child.name}'s on track — nothing stuck right now.`}</Text>
          </View>
        ) : (
          stuckCards.map((card) => <StuckCardView key={card.id} card={card} onAssign={openAssignFlow} />)
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Skill progression</Text>
        {MATH_OPERATIONS.map((operation) => {
          const status = statuses.find((item) => item.operation === operation);
          return (
            <MathSkillRow
              key={operation}
              operation={operation}
              status={status}
              unlockState={unlockState[operation]}
              gradeLevel={child.grade_level}
              onOpenChecklist={() => setChecklistSelection({ type: "math", operation, status })}
              onOpenDetail={() => openSubjectDetail(operation)}
            />
          );
        })}
        <ConjugationSkillRow
          attempts={conjugationAttempts}
          gradeLevel={child.grade_level}
          onOpenChecklist={() => setChecklistSelection({ type: "conjugation", attempts: conjugationAttempts })}
          onOpenDetail={openConjugationDetail}
        />
        <SpellingSkillRow listCount={spellingListCount} unlockState={unlockState.spelling} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Worksheet activity</Text>
          <Text style={styles.sectionMeta}>{windowLabel}</Text>
        </View>
        <View style={styles.worksheetPanel}>
          <Text style={styles.worksheetCount}>{worksheetActivity.length}</Text>
          <Text style={styles.worksheetSummary}>
            {worksheetActivity.length === 1 ? "worksheet completed" : "worksheets completed"}
          </Text>
          {worksheetSkillLabels.length === 0 ? (
            <Text style={styles.emptyMuted}>No completed worksheet activity in this window.</Text>
          ) : (
            <View style={styles.worksheetChipWrap}>
              {worksheetSkillLabels.map((label) => (
                <View key={label} style={styles.worksheetChip}>
                  <Text style={styles.worksheetChipText} numberOfLines={1}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent wins</Text>
          <View style={styles.starsPill}>
            <MaterialCommunityIcons name="star" size={14} color="#ca8a04" />
            <Text style={styles.starsText}>{stars}</Text>
          </View>
        </View>
        {recentWins.length === 0 ? (
          <Text style={styles.emptyMuted}>Wins will appear here after practice or worksheet sessions.</Text>
        ) : (
          <View style={styles.winChipWrap}>
            {recentWins.map((win) => (
              <View key={win.id} style={styles.winChip}>
                <View style={styles.winIcon}>
                  <MaterialCommunityIcons name={win.icon} size={16} color="#0f766e" />
                </View>
                <View style={styles.winTextWrap}>
                  <Text style={styles.winTitle} numberOfLines={2}>{win.title}</Text>
                  <Text style={styles.winDetail}>{win.detail} • {formatShortDate(win.date)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <GradeGoalChecklistModal
        selection={checklistSelection}
        gradeLevel={child.grade_level}
        onClose={() => setChecklistSelection(null)}
      />
    </View>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: "green" | "blue" | "violet" }) {
  const toneStyle = tone === "green" ? styles.metricGreen : tone === "blue" ? styles.metricBlue : styles.metricViolet;
  return (
    <View style={[styles.metricTile, toneStyle]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StuckCardView({ card, onAssign }: { card: StuckCard; onAssign: (operation: Operation, tierId: string) => void }) {
  const danger = card.kind === "struggling" || card.kind === "conjugation-struggling";
  const subject = card.kind === "conjugation-struggling" ? "Conjugation" : operationLabel(card.operation);
  return (
    <View style={[styles.stuckCard, danger ? styles.stuckDanger : styles.stuckWarning]}>
      <View style={styles.stuckTopRow}>
        <View style={styles.stuckTextWrap}>
          <Text style={styles.stuckKicker}>{subject} • {card.tierId}</Text>
          <Text style={styles.stuckTitle}>{card.tierLabel}</Text>
        </View>
        <MaterialCommunityIcons name={danger ? "alert-circle-outline" : "progress-alert"} size={24} color={danger ? "#dc2626" : "#d97706"} />
      </View>
      {card.kind === "struggling" || card.kind === "conjugation-struggling" ? (
        <Text style={styles.stuckMeta}>{percent(card.accuracy)} mastery accuracy • {card.attemptCount} attempts</Text>
      ) : (
        <Text style={styles.stuckMeta}>Missing facts: {card.missingFacts.join(", ")}</Text>
      )}
      <Text style={styles.recommendation}>{card.recommendation}</Text>
      <TouchableOpacity
        style={styles.assignButton}
        onPress={() => {
          if (card.kind !== "conjugation-struggling") onAssign(card.operation, card.tierId);
        }}
      >
        <MaterialCommunityIcons name="playlist-plus" size={16} color="#1d4ed8" />
        <Text style={styles.assignButtonText}>
          {card.kind === "coverage" ? "Assign these facts" : "Assign practice"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function MathSkillRow({
  operation,
  status,
  unlockState,
  gradeLevel,
  onOpenChecklist,
  onOpenDetail,
}: {
  operation: Operation;
  status?: OperationStatus;
  unlockState?: SubjectUnlockState;
  gradeLevel?: string | null;
  onOpenChecklist: () => void;
  onOpenDetail: () => void;
}) {
  const locked = unlockState && !unlockState.unlocked;
  const ladder = LADDERS[operation];
  const highestIndex = tierIndex(operation, status?.highestSolidTierId);
  const currentIndex = tierIndex(operation, status?.workingTierId);
  const targetTierId = gradeExpectedTierId(operation, gradeLevel);
  const targetIndex = tierIndex(operation, targetTierId);
  const targetTier = targetIndex >= 0 ? ladder[targetIndex] : null;
  const startsInGrade = targetTierId ? null : nextGradeForOperation(operation, gradeLevel);
  const gradeProgress = gradeProgressDisplay({ operation, gradeLevel, highestIndex, targetIndex });
  const statusText = locked
    ? `Unlocks after ${unlockState?.reasonOperation || "a prerequisite"} ${unlockState?.reasonTierId || ""}`
    : !targetTier
      ? startsInGrade
        ? `Starts in ${startsInGrade}`
        : "No year goal set for this grade"
    : gradeProgress.statusText
      ? gradeProgress.statusText
    : status?.hasAttempts
      ? status.highestSolidTierLabel
        ? `Solid through ${status.highestSolidTierLabel} • Year goal: ${targetTier.label}`
        : `Working on ${status.workingTierLabel} • Year goal: ${targetTier.label}`
      : `Year goal: ${targetTier.label}`;

  return (
    <TouchableOpacity style={styles.skillRow} activeOpacity={0.78} onPress={onOpenDetail}>
      <View style={styles.skillRowHeader}>
        <View style={styles.skillLabelWrap}>
          <MaterialCommunityIcons name={locked ? "lock-outline" : "calculator-variant-outline"} size={18} color={locked ? "#94a3b8" : "#2563eb"} />
          <Text style={styles.skillTitle}>{operationLabel(operation)}</Text>
        </View>
        <View style={styles.skillRowActions}>
          <TouchableOpacity style={styles.checklistIconButton} onPress={onOpenChecklist}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#64748b" />
          </TouchableOpacity>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
        </View>
      </View>
      <View style={styles.segmentRow}>
        {ladder.map((tier, index) => {
          const mastered = index <= highestIndex;
          const target = index === gradeProgress.displayTargetIndex;
          const current = index === currentIndex && !mastered;
          const stuck = current && status?.band === "struggling";
          return (
            <View
              key={tier.id}
              style={[
                styles.segment,
                locked && styles.segmentLocked,
                mastered && styles.segmentMastered,
                target && !mastered && !current && styles.segmentTarget,
                current && styles.segmentCurrent,
                stuck && styles.segmentStuck,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.skillStatus}>{statusText}</Text>
    </TouchableOpacity>
  );
}

function ConjugationSkillRow({
  attempts,
  gradeLevel,
  onOpenChecklist,
  onOpenDetail,
}: {
  attempts: ConjugationAttempt[];
  gradeLevel?: string | null;
  onOpenChecklist: () => void;
  onOpenDetail: () => void;
}) {
  const stats = conjugationTierStats(attempts);
  const current = currentConjugationTierAndBand(attempts);
  const highestIndex = highestSolidConjugationIndex(attempts);
  const currentIndex = conjugationTierIndex(current.tierId);
  const targetTierId = conjugationExpectedTierId(gradeLevel);
  const targetIndex = conjugationTierIndex(targetTierId);
  const targetTier = targetIndex >= 0 ? CONJUGATION_LADDER[targetIndex] : null;
  const startsInGrade = targetTierId ? null : nextConjugationGrade(gradeLevel);
  const gradeProgress = conjugationGradeProgressDisplay({ gradeLevel, highestIndex, targetIndex });
  const statusText = !targetTier
    ? startsInGrade
      ? `Starts in ${startsInGrade}`
      : "No year goal set for this grade"
    : gradeProgress.statusText
      ? gradeProgress.statusText
      : highestIndex >= 0
        ? `Solid through ${CONJUGATION_LADDER[highestIndex].label} • Year goal: ${targetTier.label}`
        : `Working on ${CONJUGATION_LADDER[currentIndex]?.label || current.tierId} • Year goal: ${targetTier.label}`;

  return (
    <TouchableOpacity style={styles.skillRow} activeOpacity={0.78} onPress={onOpenDetail}>
      <View style={styles.skillRowHeader}>
        <View style={styles.skillLabelWrap}>
          <MaterialCommunityIcons name="format-letter-case" size={18} color="#0f766e" />
          <Text style={styles.skillTitle}>Conjugation</Text>
        </View>
        <View style={styles.skillRowActions}>
          <TouchableOpacity style={styles.checklistIconButton} onPress={onOpenChecklist}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#64748b" />
          </TouchableOpacity>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
        </View>
      </View>
      <View style={styles.segmentRow}>
        {CONJUGATION_LADDER.map((tier, index) => {
          const mastered = isSolidConjugationTier(stats[tier.id]);
          const target = index === gradeProgress.displayTargetIndex;
          const currentTier = index === currentIndex && !mastered;
          const stuck = currentTier && current.band === "struggling";
          return (
            <View
              key={tier.id}
              style={[
                styles.segment,
                mastered && styles.segmentMastered,
                target && !mastered && !currentTier && styles.segmentTarget,
                currentTier && styles.segmentCurrent,
                stuck && styles.segmentStuck,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.skillStatus}>{statusText}</Text>
    </TouchableOpacity>
  );
}

function SpellingSkillRow({ listCount, unlockState }: { listCount: number; unlockState?: SubjectUnlockState }) {
  const locked = unlockState && !unlockState.unlocked;
  return (
    <TouchableOpacity style={styles.skillRow} activeOpacity={0.78} onPress={() => {}}>
      <View style={styles.skillRowHeader}>
        <View style={styles.skillLabelWrap}>
          <MaterialCommunityIcons name={locked ? "lock-outline" : "format-letter-case"} size={18} color={locked ? "#94a3b8" : "#7c3aed"} />
          <Text style={styles.skillTitle}>spelling</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
      </View>
      <View style={styles.segmentRow}>
        <View style={[styles.segment, listCount > 0 && styles.segmentMastered, locked && styles.segmentLocked]} />
        <View style={[styles.segment, listCount > 1 && styles.segmentCurrent, locked && styles.segmentLocked]} />
        <View style={[styles.segment, styles.segmentLocked]} />
      </View>
      <Text style={styles.skillStatus}>
        {locked ? "Locked for now" : listCount > 0 ? `${listCount} spelling ${listCount === 1 ? "list" : "lists"} ready` : "Ready to add words"}
      </Text>
    </TouchableOpacity>
  );
}

function GradeGoalChecklistModal({
  selection,
  gradeLevel,
  onClose,
}: {
  selection: ChecklistSelection | null;
  gradeLevel?: string | null;
  onClose: () => void;
}) {
  const isConjugation = selection?.type === "conjugation";
  const operation = selection?.type === "math" ? selection.operation : null;
  const standard = isConjugation
    ? (CONJUGATION_GRADE_EXPECTED_STANDARDS as Record<string, { citation: string } | undefined>)[gradeLevel || ""]
    : gradeExpectedTierStandard(gradeLevel);
  const targetTierId = isConjugation ? conjugationExpectedTierId(gradeLevel) : operation ? gradeExpectedTierId(operation, gradeLevel) : null;
  const targetIndex = isConjugation ? conjugationTierIndex(targetTierId) : operation ? tierIndex(operation, targetTierId) : -1;
  const tiers = isConjugation
    ? targetIndex >= 0 ? CONJUGATION_LADDER.slice(0, targetIndex + 1) : []
    : operation && targetIndex >= 0 ? LADDERS[operation].slice(0, targetIndex + 1) : [];
  const conjugationStats = isConjugation ? conjugationTierStats(selection.attempts) : null;
  const highestIndex = isConjugation
    ? highestSolidConjugationIndex(selection.attempts)
    : operation ? tierIndex(operation, selection?.status?.highestSolidTierId) : -1;
  const startsInGrade = isConjugation
    ? !targetTierId ? nextConjugationGrade(gradeLevel) : null
    : operation && !targetTierId ? nextGradeForOperation(operation, gradeLevel) : null;
  const gradeLabel = gradeLevel || "this grade";
  const subjectLabel = isConjugation ? "Conjugation" : operation ? operationLabel(operation) : "";

  return (
    <Modal visible={!!selection} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.checklistModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{subjectLabel} — {gradeLabel} year goal</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>

          {tiers.length === 0 ? (
            <Text style={styles.modalEmpty}>
              {startsInGrade ? `${subjectLabel} starts in ${startsInGrade}.` : "No year goal is set for this subject at this grade."}
            </Text>
          ) : (
            <View style={styles.checklistRows}>
              {tiers.map((tier, index) => {
                const mastered = isConjugation ? isSolidConjugationTier(conjugationStats?.[tier.id as ConjugationTierId]) : index <= highestIndex;
                return (
                  <View key={tier.id} style={styles.checklistRow}>
                    <MaterialCommunityIcons
                      name={mastered ? "check-circle" : "checkbox-blank-circle-outline"}
                      size={20}
                      color={mastered ? "#16a34a" : "#94a3b8"}
                    />
                    <View style={styles.checklistTextWrap}>
                      <Text style={styles.checklistTier}>{tier.label}</Text>
                      <Text style={styles.checklistState}>{mastered ? "Mastered" : "Not yet"}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.sourceText}>
            Source: {standard?.citation || "Grade target source unavailable."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: "center",
  },
  momentumStrip: {
    flexDirection: "row",
    gap: 8,
  },
  timeframeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeframeChip: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timeframeChipActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  timeframeChipDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  timeframeChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  timeframeChipTextActive: {
    color: "#1d4ed8",
  },
  timeframeChipTextDisabled: {
    color: "#94a3b8",
  },
  metricTile: {
    flex: 1,
    minHeight: 78,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    justifyContent: "center",
  },
  metricGreen: {
    backgroundColor: "#ecfdf5",
    borderColor: "#bbf7d0",
  },
  metricBlue: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  metricViolet: {
    backgroundColor: "#f5f3ff",
    borderColor: "#ddd6fe",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#475569",
  },
  trendPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    padding: 14,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  trendBars: {
    height: 86,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  trendItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  trendTrack: {
    width: "100%",
    height: 58,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  trendFill: {
    width: "100%",
    backgroundColor: "#14b8a6",
  },
  trendCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  emptyGood: {
    minHeight: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  emptyGoodText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#166534",
  },
  stuckCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 9,
  },
  stuckDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  stuckWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fed7aa",
  },
  stuckTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stuckTextWrap: {
    flex: 1,
  },
  stuckKicker: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  stuckTitle: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
    color: "#111827",
  },
  stuckMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  recommendation: {
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  assignButton: {
    minHeight: 40,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 12,
  },
  assignButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1d4ed8",
  },
  skillRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    padding: 13,
    gap: 9,
  },
  skillRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  skillLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skillRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checklistIconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  skillTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 5,
    height: 10,
  },
  segment: {
    flex: 1,
    borderRadius: 5,
    backgroundColor: "#cbd5e1",
  },
  segmentLocked: {
    backgroundColor: "#e2e8f0",
  },
  segmentMastered: {
    backgroundColor: "#22c55e",
  },
  segmentCurrent: {
    backgroundColor: "#2563eb",
  },
  segmentTarget: {
    backgroundColor: "#93c5fd",
  },
  segmentStuck: {
    backgroundColor: "#ef4444",
  },
  skillStatus: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748b",
    fontWeight: "700",
  },
  worksheetPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    padding: 14,
    gap: 8,
  },
  worksheetCount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  worksheetSummary: {
    marginTop: -4,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  worksheetChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  worksheetChip: {
    maxWidth: "48%",
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  worksheetChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  starsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    backgroundColor: "#fef9c3",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  starsText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#854d0e",
  },
  winChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  winChip: {
    width: "48%",
    minHeight: 86,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccfbf1",
    backgroundColor: "#f0fdfa",
    padding: 10,
    gap: 8,
  },
  winIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ccfbf1",
  },
  winTextWrap: {
    flex: 1,
  },
  winTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    color: "#134e4a",
  },
  winDetail: {
    marginTop: 2,
    fontSize: 12,
    color: "#0f766e",
    fontWeight: "600",
  },
  emptyMuted: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
    backgroundColor: "#f8fafc",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  checklistModal: {
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 16,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "capitalize",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  modalEmpty: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12,
    fontSize: 14,
    lineHeight: 19,
    color: "#475569",
    fontWeight: "700",
  },
  checklistRows: {
    gap: 10,
  },
  checklistRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
  },
  checklistTextWrap: {
    flex: 1,
  },
  checklistTier: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  checklistState: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  sourceText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#64748b",
    fontWeight: "600",
  },
});
