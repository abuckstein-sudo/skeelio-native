// lib/whatsNext.ts
// Pure logic. No I/O. Map getSubjectMastery() output to MasteryRow[].

type MasteryRow = { topic: string; score: number; attempts: number }; // score 0–1

const STRONG = 0.8;
const MIN_ATTEMPTS = 5; // below this, don't trust a high score (light guard, NOT full calibration)

// Curriculum universe + gentle copy. Order = suggestion priority for "not started".
const TOPICS: { topic: string; label: string; nextChallenge: string }[] = [
  { topic: "addition", label: "Addition", nextChallenge: "bigger numbers" },
  { topic: "subtraction", label: "Subtraction", nextChallenge: "borrowing / column subtraction" },
  { topic: "multiplication", label: "Times tables", nextChallenge: "multi-digit multiplication" },
  { topic: "division", label: "Division", nextChallenge: "harder ones (multi-digit / remainders)" },
  { topic: "word_problems", label: "Word problems", nextChallenge: "trickier two-step problems" },
];

export type NextStep = {
  kind: "start" | "practice" | "levelup";
  topic: string;
  headline: string;
  cta: string;
};

export function getWhatsNext(rows: MasteryRow[]): NextStep {
  const byTopic = new Map(rows.map(r => [r.topic, r]));

  const notStarted = TOPICS.find(t => !byTopic.has(t.topic));
  if (notStarted) {
    return {
      kind: "start", topic: notStarted.topic,
      headline: `Ready to try ${notStarted.label.toLowerCase()} — it hasn't been practiced yet.`,
      cta: `Start ${notStarted.label}`,
    };
  }

  const building = TOPICS
    .map(t => ({ t, r: byTopic.get(t.topic)! }))
    .filter(({ r }) => r.score < STRONG || r.attempts < MIN_ATTEMPTS)
    .sort((a, b) => a.r.score - b.r.score)[0];
  if (building) {
    return {
      kind: "practice", topic: building.t.topic,
      headline: `A little more ${building.t.label.toLowerCase()} practice will help it click.`,
      cta: `Practice ${building.t.label}`,
    };
  }

  const top = TOPICS
    .map(t => ({ t, r: byTopic.get(t.topic)! }))
    .sort((a, b) => b.r.attempts - a.r.attempts)[0];
  return {
    kind: "levelup", topic: top.t.topic,
    headline: `${top.t.label} is looking strong — ready to try ${top.t.nextChallenge}.`,
    cta: `Level up ${top.t.label}`,
  };
}
