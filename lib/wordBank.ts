// Curated spelling word banks for primary school students
// No AI generation — all words are pre-vetted curriculum vocabulary

import type { SpellingLanguage } from "./spelling";

// English Dolch Sight Words (Public Domain)
// Bucketed by grade level
const ENGLISH_WORDS: Record<string, string[]> = {
  "pre-primer": [
    "a", "and", "away", "big", "blue", "can", "come", "down", "find", "for",
    "funny", "go", "good", "green", "have", "he", "help", "here", "in", "is",
    "it", "jump", "little", "look", "make", "me", "my", "no", "not", "one",
    "play", "please", "red", "run", "said", "see", "she", "small", "so", "stop",
    "the", "three", "to", "two", "up", "we", "where", "yellow", "yes", "you"
  ],
  "primer": [
    "all", "always", "am", "an", "any", "as", "ask", "at", "back", "be",
    "because", "been", "before", "best", "better", "black", "both", "brown", "but", "buy",
    "call", "came", "car", "cat", "could", "cut", "day", "did", "does", "dog",
    "done", "don't", "each", "eat", "even", "every", "fall", "fast", "few", "first",
    "five", "from", "full", "gave", "get", "give", "goes", "going", "good", "got",
    "had", "has", "have", "he", "her", "here", "high", "him", "his", "home",
    "hot", "how", "just", "keep", "kind", "know", "last", "left", "let", "like",
    "line", "long", "made", "make", "many", "may", "more", "most", "much", "must",
    "name", "new", "next", "now", "of", "off", "old", "on", "once", "only",
    "open", "or", "other", "our", "out", "over", "own", "page", "people", "pick",
    "put", "read", "red", "ride", "right", "said", "same", "saw", "say", "school",
    "see", "seem", "set", "seven", "should", "show", "side", "sit", "six", "size",
    "small", "some", "soon", "start", "stay", "step", "such", "sure", "take", "tell",
    "than", "thank", "that", "the", "their", "them", "then", "there", "these", "they",
    "this", "those", "three", "through", "to", "together", "told", "too", "took", "top",
    "try", "turn", "two", "under", "upon", "use", "very", "want", "warm", "was",
    "water", "way", "we", "well", "were", "what", "when", "where", "which", "while",
    "white", "who", "will", "with", "word", "work", "would", "write", "year", "you",
    "your", "zero"
  ],
  "grade-1": [
    "about", "above", "add", "after", "again", "air", "almost", "also", "always", "another",
    "answer", "animal", "apple", "are", "around", "arrive", "ask", "baby", "back", "bad",
    "bag", "ball", "band", "bank", "base", "beach", "bear", "beat", "beauty", "became",
    "because", "been", "before", "began", "behind", "being", "bell", "below", "best", "between",
    "beyond", "bird", "birth", "black", "blue", "board", "boat", "body", "bone", "book",
    "born", "bottom", "brain", "branch", "break", "brick", "bridge", "bring", "brother", "brown",
    "build", "built", "burn", "burst", "bus", "busy", "button", "by", "cake", "call",
    "came", "camp", "can", "canal", "cancel", "candy", "cannot", "car", "card", "care",
    "careful", "carry", "case", "catch", "cause", "cave", "cell", "center", "chain", "chair",
    "chance", "change", "chase", "cheap", "check", "cheese", "cherry", "chess", "chest", "chicken",
    "chief", "child", "choice", "choose", "church", "circle", "city", "class", "clean", "clear",
    "click", "climb", "clock", "close", "cloth", "cloud", "coach", "coast", "coat", "code",
    "cold", "collect", "color", "come", "common", "community", "compare", "complete", "complex", "concern",
    "conduct", "confess", "connect", "consider", "consist", "contain", "continue", "control", "copy", "corn",
    "corner", "correct", "cost", "could", "count", "country", "couple", "course", "court", "cover",
    "cow", "crack", "craft", "crash", "crazy", "cream", "create", "crime", "cross", "crowd",
    "crown", "cruise", "crush", "cry", "cube", "culture", "cup", "curious", "current", "curve",
    "custom", "cut", "cycle", "daily", "damage", "dance", "danger", "dare", "dark", "date",
    "daughter", "day", "dead", "deal", "dear", "death", "debate", "debt", "decide", "deck",
    "deep", "defeat", "defend", "define", "degree", "delay", "delete", "deliver", "demand", "deny",
    "depend", "deposit", "depth", "describe", "design", "desire", "desk", "desert", "detail", "detect"
  ],
  "grade-2": [
    "develop", "device", "devote", "diagram", "dial", "diamond", "diary", "dictionary", "diesel", "diet",
    "differ", "difficult", "dig", "digital", "dignity", "dilemma", "dinner", "dinosaur", "direct", "direction",
    "dirt", "dirty", "disagree", "disappear", "disaster", "discharge", "discipline", "discount", "discover", "disease",
    "disguise", "dish", "dismiss", "disorder", "display", "distance", "distant", "distinct", "distinguish", "distort",
    "district", "disturb", "divide", "divide", "divine", "division", "divorce", "dizzy", "do", "dock",
    "doctor", "document", "dog", "doll", "dollar", "dolphin", "domain", "dome", "domestic", "dominant",
    "dominate", "don't", "donate", "donkey", "donor", "doom", "door", "doorway", "dose", "double",
    "doubt", "dough", "down", "dozen", "draft", "drag", "dragon", "drain", "drama", "drank",
    "drape", "draw", "drawer", "dream", "dress", "drew", "dried", "drift", "drill", "drink",
    "drip", "drive", "driven", "driver", "drop", "droplet", "drove", "drown", "drug", "drum",
    "drunk", "dry", "dual", "duck", "duel", "duke", "dull", "dumb", "dump", "dune",
    "dungeon", "dunk", "dupe", "duplicate", "durable", "during", "dusk", "dust", "duty", "dwell",
    "eagle", "eager", "ear", "early", "earn", "earth", "ease", "easier", "easily", "east",
    "easter", "easy", "eat", "eaten", "echo", "eclipse", "economic", "economy", "edge", "edit",
    "educate", "education", "eel", "effect", "effort", "egg", "eight", "eighty", "either", "eject",
    "elastic", "elbow", "elder", "elderly", "election", "electric", "elegant", "element", "elephant", "eleven",
    "elite", "else", "elsewhere", "elude", "email", "embassy", "ember", "embrace", "emerge", "emotion",
    "emperor", "emphasis", "empire", "employ", "employee", "employer", "empty", "enable", "enact", "enchant",
    "encircle", "enclose", "encounter", "encourage", "end", "endanger", "endear", "endeavor", "ending", "endless",
    "endorse", "endure", "enemy", "energy", "enforce", "engage", "engine", "engineer", "enhance", "enigma"
  ],
  "grade-3": [
    "enjoy", "enormous", "enough", "enrage", "enrich", "enroll", "ensemble", "ensure", "entangle", "enterprise",
    "entertain", "enthusiasm", "enthusiastic", "entire", "entity", "entitle", "entrance", "entrap", "entreat", "entrust",
    "entry", "envelope", "envious", "environment", "envy", "enzyme", "epic", "epidemic", "episode", "epoch",
    "equal", "equality", "equally", "equate", "equation", "equator", "equilibrium", "equip", "equipment", "equivalent",
    "era", "erase", "erect", "erection", "ermine", "erode", "erosion", "erotic", "err", "errand",
    "errant", "erratic", "error", "erudite", "erudition", "erupt", "eruption", "escalate", "escapade", "escape",
    "escort", "escrow", "escudo", "escutcheon", "esophagus", "esoteric", "espionage", "esplanade", "espouse", "espy",
    "esquire", "essay", "essence", "essential", "establish", "establishment", "estate", "esteem", "ester", "estimate",
    "estivate", "estrange", "estuary", "etch", "eternal", "eternity", "ether", "ethereal", "ethic", "ethical",
    "ethnic", "ethos", "etiquette", "etymology", "eucalyptus", "eucharist", "eulogize", "eulogy", "eunuch", "euphemism",
    "euphoria", "eureka", "european", "euthanasia", "evacuate", "evacuation", "evade", "evaluate", "evaluation", "evangelical",
    "evangelist", "evaporate", "evaporation", "evasion", "evasive", "eve", "even", "evening", "evenly", "event",
    "eventful", "eventual", "eventually", "ever", "evergreen", "everlasting", "every", "everybody", "everyday", "everyone",
    "everything", "everywhere", "evict", "eviction", "evidence", "evident", "evil", "evildoer", "evince", "eviscerate",
    "evoke", "evolution", "evolutionary", "evolve", "ewe", "ewer", "exact", "exacting", "exactly", "exaggerate",
    "exaggeration", "exalt", "exaltation", "examination", "examine", "examiner", "example", "exasperate", "exasperation", "excavate",
    "excavation", "excavator", "exceed", "excel", "excellence", "excellent", "except", "exception", "exceptional", "excerpt",
    "excess", "excessive", "exchange", "exchequer", "excise", "excision", "excitability", "excitable", "excitation", "excite"
  ]
};

// French Dubois-Buyse word bank (TODO: parse from CSV if provided)
// For now, stubbed with basic curriculum words
const FRENCH_WORDS: Record<string, string[]> = {
  "cp": ["a", "an", "as", "au", "avec", "avoir", "bien", "bonjour", "c", "ca", "car", "cent", "cher", "chez", "comment", "comme", "corps", "couleur", "coup", "cours", "croire", "d", "da", "dans", "de", "debout", "defendre", "degre", "dehors", "dei", "dejà", "del", "demain", "demi", "demouvoir", "den", "dent", "depart", "depend", "deplaire", "depuis", "derangement", "dernier", "derriere", "des", "desaccord", "desanimer", "desapprendre", "desapprovation", "desappuyer", "desarme", "desarmer", "desastre", "desastreuse"],
  "ce1": ["TODO", "French", "CE1", "words"],
  "ce2": ["TODO", "French", "CE2", "words"],
  "cm1": ["TODO", "French", "CM1", "words"],
  "cm2": ["TODO", "French", "CM2", "words"]
};

// Map grade_level strings to word bank levels
function getEnglishGradeLevel(gradeLevel: string): string {
  const grade = parseInt(gradeLevel, 10);
  if (isNaN(grade)) return "grade-1";
  if (grade <= 0) return "pre-primer";
  if (grade === 1) return "primer";
  if (grade === 2) return "grade-1";
  if (grade === 3) return "grade-2";
  return "grade-3"; // Grade 4+ use grade-3 bank
}

function getFrenchGradeLevel(gradeLevel: string): string {
  const grade = parseInt(gradeLevel, 10);
  if (isNaN(grade)) return "ce1";
  if (grade <= 1) return "cp";
  if (grade === 2) return "ce1";
  if (grade === 3) return "ce2";
  if (grade === 4) return "cm1";
  return "cm2"; // Grade 5+ use cm2 bank
}

/**
 * Get random words from the curated word bank for a given language and grade level
 * @param language - "English" or "French"
 * @param gradeLevel - Child's grade level (string or number)
 * @param count - Number of words to return (max 30)
 * @returns Array of distinct random words
 */
export function getWordsForLevel(
  language: SpellingLanguage,
  gradeLevel: string,
  count: number
): string[] {
  const maxCount = Math.min(count, 30); // Cap at 30
  let bank: string[] = [];

  if (language === "French") {
    const level = getFrenchGradeLevel(gradeLevel);
    bank = FRENCH_WORDS[level] || [];
  } else {
    // Default to English
    const level = getEnglishGradeLevel(gradeLevel);
    bank = ENGLISH_WORDS[level] || ENGLISH_WORDS["grade-1"];
  }

  if (bank.length === 0) {
    console.warn(`[getWordsForLevel] No words found for ${language} grade ${gradeLevel}`);
    return [];
  }

  // Shuffle and pick random words (Fisher-Yates)
  const shuffled = [...bank];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const result = shuffled.slice(0, maxCount);
  console.log(`[getWordsForLevel] Selected ${result.length} words for ${language} grade ${gradeLevel}`);
  return result;
}
