// Single source of truth for every mastery / competence threshold.
// Change numbers here, not in the individual gates.

export const SKILL_SESSION = {
  // Mastery = this many consecutive UNAIDED first-try-correct answers,
  // spanning at least masteryMinDistinctItems different items (no streak-padding with repeats).
  masteryFirstTryCorrect: 10,
  masteryWindow: 12,
  masteryMinDistinctItems: 6,
  sessionCap: 12,
};

export const TIER_GATE = {
  minUnaidedAttempts: 12, // was 8
  minUnaidedRate: 0.85,
};

export const ASSESSMENT = {
  notEnoughDataBelowUnaided: 12, // < this many unaided attempts => not_enough_data (was 8)
  onTrackUnaidedRate: 0.85,      // unaided rate >= this (+ at/above grade tier for math) => on_track
  activeWindowDays: 14,
  recencyDecayDays: 21,          // verdict downgrades if no unaided practice within this window
};
