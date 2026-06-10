import { supabase } from "@/lib/supabase";
import * as Speech from "expo-speech";

export type SpellingLanguage = "English" | "French";

export type SpellingList = {
  id: string;
  user_id: string;
  student_id: string;
  title: string;
  language: SpellingLanguage;
  source_type: "photo" | "manual";
  created_at: string;
};

export type SpellingItem = {
  id: string;
  list_id: string;
  item_text: string;
  item_order: number | null;
  language: SpellingLanguage;
  user_id: string;
  student_id: string;
  normalized_text: string;
  sentence?: string;
};

export type SpellingSession = {
  id: string;
  student_id: string;
  list_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  status: "in_progress" | "completed";
  total_items: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
};

export type SpellingAttempt = {
  id: string;
  session_id: string;
  item_id: string;
  item_text: string;
  student_answer: string;
  is_correct: boolean;
  attempt_number: number;
  created_at: string;
  user_id: string;
  student_id: string;
  list_id: string;
};

export type ErrorType =
  | "none"
  | "wrong_letter"
  | "wrong_vowel"
  | "wrong_ending"
  | "missing_letter"
  | "extra_letter"
  | "transposition"
  | "unknown";

export type GradeResult = {
  is_correct: boolean;
  feedback: string;
  error_type: ErrorType;
};

// ── Normalization ──────────────────────────────────────────────

export function normalise(input: string): string {
  let s = (input ?? "").normalize("NFC");
  s = s.toLowerCase();
  // Fold apostrophes: U+2018 U+2019 U+02BC U+2032 to ASCII apostrophe
  s = s.split("").map(c => {
    const code = c.charCodeAt(0);
    if (code === 0x2018 || code === 0x2019 || code === 0x02BC || code === 0x2032) {
      return "’";
    }
    return c;
  }).join("");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ── Error Detection ────────────────────────────────────────────

function detectErrorType(a: string, b: string): ErrorType {
  if (a === b) return "none";
  if (!a || !b) return "unknown";

  // Wrong ending: last 1-2 chars differ but prefix matches a lot
  const minLen = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < minLen && a[prefix] === b[prefix]) prefix++;
  if (prefix >= Math.max(2, minLen - 2) && prefix < a.length)
    return "wrong_ending";

  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);

    if (
      diffs.length === 2 &&
      a[diffs[0]] === b[diffs[1]] &&
      a[diffs[1]] === b[diffs[0]]
    ) {
      return "transposition";
    }

    if (diffs.length === 1) {
      const ca = a[diffs[0]];
      const cb = b[diffs[0]];
      if ("aeiouy".includes(ca) && "aeiouy".includes(cb))
        return "wrong_vowel";
      return "wrong_letter";
    }

    return "wrong_letter";
  }

  if (b.length < a.length) return "missing_letter";
  return "extra_letter";
}

// ── Grading ───────────────────────────────────────────────────

export function gradeSpellingAttempt(
  correct: string,
  given: string,
  _language?: SpellingLanguage // kept for backwards compatibility, not used
): GradeResult {
  // Grade from fresh normalization, not stored normalized_text
  // This ensures accent-sensitivity works correctly
  const a = normalise(correct);
  const b = normalise(given);
  const is_correct = a.length > 0 && a === b;
  const error_type = is_correct ? "none" : detectErrorType(a, b);

  // TEMPORARY: Diagnostic logging with codepoints
  console.log("[grade] item raw", JSON.stringify(correct), [...correct].map((c) => c.charCodeAt(0).toString(16)));
  console.log("[grade] user raw", JSON.stringify(given), [...given].map((c) => c.charCodeAt(0).toString(16)));
  console.log("[grade] item norm", JSON.stringify(a), [...a].map((c) => c.charCodeAt(0).toString(16)));
  console.log("[grade] user norm", JSON.stringify(b), [...b].map((c) => c.charCodeAt(0).toString(16)));
  console.log("[grade] equal?", is_correct);

  return {
    is_correct,
    feedback: is_correct
      ? "Correct!"
      : `The correct spelling is "${correct}".`,
    error_type,
  };
}

// ── Fallback Hints ─────────────────────────────────────────────

export function fallbackHint(
  errorType: ErrorType,
  attempt: 1 | 2 | 3
): string {
  if (attempt === 3)
    return "Say the word slowly and listen to every single sound.";
  switch (errorType) {
    case "wrong_ending":
      return "Check the ending carefully — what letters make that last sound?";
    case "missing_letter":
      return "This word has a letter you might not hear when you say it.";
    case "extra_letter":
      return "Say it slowly — you may have added a letter you don't need.";
    case "wrong_vowel":
      return "Listen to the vowel sound — there may be a different vowel.";
    case "transposition":
      return "Two letters might be swapped — check the order.";
    case "wrong_letter":
      return "Check each letter carefully — one doesn't match the word's sound.";
    default:
      return "Say the word slowly and check every sound matches a letter.";
  }
}

// ── Manual Input Parsing ──────────────────────────────────

export const MAX_WORDS_PER_LIST = 30;

export function parseManualWords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/g)
        .map((w) => w.trim())
        .filter((w) => w.length > 0)
    )
  ).slice(0, MAX_WORDS_PER_LIST);
}

// ── Speech ────────────────────────────────────────────────────

export function speechLangCode(language: SpellingLanguage): string {
  return language === "French" ? "fr-FR" : "en-US";
}

export async function speakWord(
  word: string,
  language: SpellingLanguage
): Promise<void> {
  try {
    console.log("[speakWord] starting - word:", word, "language:", language);
    await Speech.stop();
    await Speech.speak(word, {
      language: speechLangCode(language),
      rate: 0.9,
      onError: (error) => console.error("[speech] error:", error),
    });
    const isSpeaking = await Speech.isSpeakingAsync();
    console.log("[speakWord] after speak - isSpeaking:", isSpeaking);
  } catch (error) {
    console.error("[speech] speak failed:", error);
  }
}

export async function speakSentence(
  sentence: string,
  language: SpellingLanguage
): Promise<void> {
  try {
    console.log("[speakSentence] starting - sentence:", sentence.substring(0, 50), "language:", language);
    await Speech.stop();
    await Speech.speak(sentence, {
      language: speechLangCode(language),
      rate: 0.85, // Slightly slower for sentence
      onError: (error) => console.error("[speech] error:", error),
    });
  } catch (error) {
    console.error("[speech] speak sentence failed:", error);
  }
}

export async function generateSentence(
  word: string,
  language: SpellingLanguage
): Promise<string> {
  try {
    console.log("[generateSentence] calling function for word:", word, "language:", language);

    const { data, error: invokeError } = await supabase.functions.invoke("spelling-sentence", {
      body: { word, language },
    });

    console.log("[generateSentence] invoke error:", invokeError, "data:", data);

    if (invokeError) {
      console.error("[generateSentence] function error:", invokeError);
      throw invokeError;
    }

    const sentence = data?.sentence ?? "";
    if (!sentence) {
      throw new Error("No sentence returned from function");
    }

    console.log("[generateSentence] generated sentence for", word, ":", sentence.substring(0, 50));
    return sentence;
  } catch (error) {
    console.error("[generateSentence] failed:", error);
    throw error;
  }
}

export async function extractWordsFromImage(
  imageBase64: string,
  mimeType: string
): Promise<{ words: string[]; language: SpellingLanguage }> {
  try {
    console.log("[extractWordsFromImage] calling extract-spelling-words function");

    const { data, error: invokeError } = await supabase.functions.invoke("extract-spelling-words", {
      body: { imageBase64, mimeType },
    });

    console.log("[extractWordsFromImage] invoke error:", invokeError, "data:", data);

    if (invokeError) {
      console.error("[extractWordsFromImage] function error:", invokeError);
      throw invokeError;
    }

    const words = data?.words ?? [];
    const language = data?.language ?? "English";

    if (!Array.isArray(words)) {
      throw new Error("Invalid response: words is not an array");
    }

    console.log("[extractWordsFromImage] extracted", words.length, "words in", language);
    return { words, language: language as SpellingLanguage };
  } catch (error) {
    console.error("[extractWordsFromImage] failed:", error);
    throw error;
  }
}

export async function updateItemSentence(
  itemId: string,
  sentence: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("spelling_list_items")
      .update({ sentence })
      .eq("id", itemId);

    if (error) throw error;
    console.log("[updateItemSentence] cached sentence for item:", itemId);
  } catch (error) {
    // Best-effort caching: log but don't throw
    // Audio playback has already happened, so don't block on cache failure
    console.error("[updateItemSentence] cache failed (non-blocking):", error);
  }
}


// ── DB Queries ─────────────────────────────────────────────────

export async function listSpellingListsForChild(
  childId: string
): Promise<SpellingList[]> {
  const { data, error } = await supabase
    .from("spelling_lists")
    .select("*")
    .eq("student_id", childId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SpellingList[];
}

export async function getListItems(listId: string): Promise<SpellingItem[]> {
  const { data: items, error } = await supabase
    .from("spelling_list_items")
    .select("*")
    .eq("list_id", listId)
    .order("item_order", { ascending: true });

  if (error) throw error;
  return (items ?? []) as SpellingItem[];
}

export async function getListWithItems(listId: string): Promise<{
  list: SpellingList;
  items: SpellingItem[];
} | null> {
  const { data: list, error: listError } = await supabase
    .from("spelling_lists")
    .select("*")
    .eq("id", listId)
    .maybeSingle();

  if (listError) throw listError;
  if (!list) return null;

  const items = await getListItems(listId);

  return {
    list: list as SpellingList,
    items,
  };
}

export async function createSpellingSession(
  childId: string,
  listId: string,
  totalItems: number
): Promise<SpellingSession> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("spelling_practice_sessions")
    .insert({
      student_id: childId,
      list_id: listId,
      user_id: authData.user.id,
      started_at: new Date().toISOString(),
      status: "in_progress",
      total_items: totalItems,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SpellingSession;
}

export async function recordSpellingAttempt(
  sessionId: string,
  itemId: string,
  childId: string,
  listId: string,
  itemText: string,
  studentAnswer: string,
  isCorrect: boolean,
  attemptNumber: number
): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Not authenticated");

  const { error } = await supabase.from("spelling_practice_attempts").insert({
    session_id: sessionId,
    item_id: itemId,
    student_id: childId,
    list_id: listId,
    user_id: authData.user.id,
    item_text: itemText,
    student_answer: studentAnswer,
    is_correct: isCorrect,
    attempt_number: attemptNumber,
  });

  if (error) throw error;
}

export async function endSpellingSession(
  sessionId: string,
  totalItems: number,
  correctCount: number,
  incorrectCount: number
): Promise<void> {
  const { error } = await supabase
    .from("spelling_practice_sessions")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
      total_items: totalItems,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
    })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function getSessionAttempts(
  sessionId: string
): Promise<SpellingAttempt[]> {
  const { data, error } = await supabase
    .from("spelling_practice_attempts")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SpellingAttempt[];
}

// ── List Creation & Deletion (Parent) ──────────────────────

export async function createSpellingList(
  childId: string,
  title: string,
  language: SpellingLanguage,
  sourceType: "photo" | "manual"
): Promise<SpellingList> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("spelling_lists")
    .insert({
      user_id: authData.user.id,
      student_id: childId,
      title,
      language,
      source_type: sourceType,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SpellingList;
}

export async function createSpellingItems(
  listId: string,
  childId: string,
  words: string[],
  language: SpellingLanguage
): Promise<SpellingItem[]> {
  if (words.length === 0) return [];

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Not authenticated");

  const rows = words.map((word, i) => ({
    list_id: listId,
    user_id: authData.user.id,
    student_id: childId,
    item_text: word,
    normalized_text: normalise(word),
    language,
    item_order: i + 1,
  }));

  const { data, error } = await supabase
    .from("spelling_list_items")
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as SpellingItem[];
}

export async function deleteSpellingList(listId: string): Promise<void> {
  // Delete items first
  const { error: itemError } = await supabase
    .from("spelling_list_items")
    .delete()
    .eq("list_id", listId);

  if (itemError) throw itemError;

  // Then delete list
  const { error: listError } = await supabase
    .from("spelling_lists")
    .delete()
    .eq("id", listId);

  if (listError) throw listError;
}

export async function getListItemCount(listId: string): Promise<number> {
  const { count, error } = await supabase
    .from("spelling_list_items")
    .select("*", { count: "exact", head: true })
    .eq("list_id", listId);

  if (error) throw error;
  return count ?? 0;
}
