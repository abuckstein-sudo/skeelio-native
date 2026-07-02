import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Attempt, factTierCoverageGapAfterOtherGates, factTierCoverageKeys, isSolidTierStat, tierStats } from "@/lib/tutor/ability";
import { getOperationStatus, OperationStatus } from "@/lib/tutor/status";
import { computeUnlockState, SubjectUnlockState } from "@/lib/tutor/unlockGraph";
import { LADDERS, Operation, tierIndex } from "@/lib/tutorConfig";
import { listWorksheetSkillsForChild, worksheetSkillLabel, WorksheetSkill } from "@/lib/worksheetSkills";
import { operationLabel, recommendationFor } from "@/lib/progressGlance";

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
    };

type RecentWin = {
  id: string;
  title: string;
  detail: string;
  date: Date;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const MATH_OPERATIONS: Operation[] = ["addition", "subtraction", "multiplication", "division"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

function trendBuckets(events: RecentWin[], now: Date) {
  return Array.from({ length: 4 }).map((_, index) => {
    const start = new Date(now.getTime() - (3 - index) * WEEK_MS);
    const end = new Date(start.getTime() + WEEK_MS);
    const count = events.filter((event) => event.date >= start && event.date < end).length;
    return { label: `W${index + 1}`, count };
  });
}

function buildStuckCards(statuses: OperationStatus[], rows: LearningAttemptRow[]): StuckCard[] {
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
      if (cards.some((card) => card.operation === operation && card.tierId === tier.id)) continue;
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

  return cards.slice(0, 3);
}

export default function ChildProgressGlance({ child }: { child: Child }) {
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<OperationStatus[]>([]);
  const [attemptRows, setAttemptRows] = useState<LearningAttemptRow[]>([]);
  const [worksheetSkills, setWorksheetSkills] = useState<WorksheetSkill[]>([]);
  const [spellingListCount, setSpellingListCount] = useState(0);
  const [stars, setStars] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [operationStatuses, attemptsResult, rewardsResult, skills, spellingResult] = await Promise.all([
          Promise.all(MATH_OPERATIONS.map((operation) => getOperationStatus(child.id, operation, child))),
          supabase
            .from("learning_attempts")
            .select("topic, tier, question_text, was_correct, ai_hint_used, evidence_source, created_at")
            .eq("child_id", child.id)
            .not("tier", "is", null),
          supabase.from("rewards").select("stars").eq("child_id", child.id).maybeSingle(),
          listWorksheetSkillsForChild(child.id),
          supabase.from("spelling_lists").select("id", { count: "exact", head: true }).eq("child_id", child.id),
        ]);

        if (cancelled) return;
        setStatuses(operationStatuses);
        setAttemptRows((attemptsResult.data || []) as LearningAttemptRow[]);
        setStars(rewardsResult.data?.stars ?? 0);
        setWorksheetSkills(skills);
        setSpellingListCount(spellingResult.count ?? 0);
      } catch (error) {
        console.error("[progress-glance] load error:", error);
        if (!cancelled) {
          setStatuses([]);
          setAttemptRows([]);
          setWorksheetSkills([]);
          setSpellingListCount(0);
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
  const weekCutoff = new Date(now.getTime() - WEEK_MS);
  const weekRows = attemptRows.filter((row) => row.created_at && new Date(row.created_at) >= weekCutoff);
  const correctThisWeek = weekRows.filter((row) => row.was_correct).length;
  const correctRate = weekRows.length > 0 ? (correctThisWeek / weekRows.length) * 100 : 0;
  const masteredThisWeek = mathMasteryEvents.filter((event) => event.date >= weekCutoff).length;
  const trends = trendBuckets(mathMasteryEvents, now);
  const maxTrend = Math.max(1, ...trends.map((trend) => trend.count));
  const stuckCards = buildStuckCards(statuses, attemptRows);

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
      <View style={styles.momentumStrip}>
        <MetricTile label="Tiers mastered" value={String(masteredThisWeek)} tone="green" />
        <MetricTile label="Practices done" value={String(weekRows.length)} tone="blue" />
        <MetricTile label="Correct this week" value={percent(correctRate)} tone="violet" />
      </View>

      <View style={styles.trendPanel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>4-week mastery trend</Text>
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
        <Text style={styles.sectionTitle}>Where {child.name}'s stuck</Text>
        {stuckCards.length === 0 ? (
          <View style={styles.emptyGood}>
            <MaterialCommunityIcons name="check-circle-outline" size={26} color="#16a34a" />
            <Text style={styles.emptyGoodText}>{child.name}'s on track — nothing stuck right now.</Text>
          </View>
        ) : (
          stuckCards.map((card) => <StuckCardView key={card.id} card={card} />)
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
            />
          );
        })}
        <SpellingSkillRow listCount={spellingListCount} unlockState={unlockState.spelling} />
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

function StuckCardView({ card }: { card: StuckCard }) {
  const danger = card.kind === "struggling";
  return (
    <View style={[styles.stuckCard, danger ? styles.stuckDanger : styles.stuckWarning]}>
      <View style={styles.stuckTopRow}>
        <View style={styles.stuckTextWrap}>
          <Text style={styles.stuckKicker}>{operationLabel(card.operation)} • {card.tierId}</Text>
          <Text style={styles.stuckTitle}>{card.tierLabel}</Text>
        </View>
        <MaterialCommunityIcons name={danger ? "alert-circle-outline" : "progress-alert"} size={24} color={danger ? "#dc2626" : "#d97706"} />
      </View>
      {card.kind === "struggling" ? (
        <Text style={styles.stuckMeta}>{percent(card.accuracy)} mastery accuracy • {card.attemptCount} attempts</Text>
      ) : (
        <Text style={styles.stuckMeta}>Missing facts: {card.missingFacts.join(", ")}</Text>
      )}
      <Text style={styles.recommendation}>{card.recommendation}</Text>
      <TouchableOpacity style={styles.assignButton} onPress={() => {}}>
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
}: {
  operation: Operation;
  status?: OperationStatus;
  unlockState?: SubjectUnlockState;
}) {
  const locked = unlockState && !unlockState.unlocked;
  const ladder = LADDERS[operation];
  const highestIndex = tierIndex(operation, status?.highestSolidTierId);
  const currentIndex = tierIndex(operation, status?.workingTierId);
  const statusText = locked
    ? `Unlocks after ${unlockState?.reasonOperation || "a prerequisite"} ${unlockState?.reasonTierId || ""}`
    : status?.hasAttempts
      ? status.highestSolidTierLabel
        ? `Solid through ${status.highestSolidTierLabel}`
        : `Working on ${status.workingTierLabel}`
      : `Ready to start at ${status?.workingTierLabel || ladder[0]?.label || "the first tier"}`;

  return (
    <TouchableOpacity style={styles.skillRow} activeOpacity={0.78} onPress={() => {}}>
      <View style={styles.skillRowHeader}>
        <View style={styles.skillLabelWrap}>
          <MaterialCommunityIcons name={locked ? "lock-outline" : "calculator-variant-outline"} size={18} color={locked ? "#94a3b8" : "#2563eb"} />
          <Text style={styles.skillTitle}>{operationLabel(operation)}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
      </View>
      <View style={styles.segmentRow}>
        {ladder.map((tier, index) => {
          const mastered = index <= highestIndex;
          const current = index === currentIndex && !mastered;
          const stuck = current && status?.band === "struggling";
          return (
            <View
              key={tier.id}
              style={[
                styles.segment,
                locked && styles.segmentLocked,
                mastered && styles.segmentMastered,
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
  segmentStuck: {
    backgroundColor: "#ef4444",
  },
  skillStatus: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748b",
    fontWeight: "700",
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
});
