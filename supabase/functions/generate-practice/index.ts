import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore: Supabase Edge runtime requires .ts extension for relative imports.
import { callOpenAIChat, resetOpenAIChatBudget } from "../_shared/openai.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATH_ANSWERABILITY_RULES = `ANSWERABILITY RULES:
- Every item must have exactly ONE answer that answer_type can express and the child can enter.
- answer_type "number" means exactly ONE numeric value. FORBID multi-part questions, "who/which/person/name" answers, "qui ... et combien" / "which ... and how many" prompts, and prompts whose true answer could be equal/neither/same/none/non-numeric.
- Do NOT use answer_type "number" for "who has more/less", "which collection is larger/smaller", or "how many more/less" comparison wording when equality is possible or the wording presupposes a winner.
- Use answer_type "yesno" for comparison/equality checks: ask one boolean claim and make check_expression compute that boolean.
- BAD NEGATIVE EXAMPLE: { "answer_type":"number", "question":"Luc a 4 boîtes de 25 billes et Marie a 5 boîtes de 20 billes. Qui a plus et combien ?", "check_expression":"(4*25)-(5*20)", "claimed_answer":0 } is INVALID because it asks for a person plus a number, and the actual comparison is equal/neither.
- GOOD YES/NO REWRITE: { "answer_type":"yesno", "question":"Luc a-t-il plus de billes que Marie ? Luc a 4 boîtes de 25 billes. Marie a 5 boîtes de 20 billes.", "check_expression":"4*25 > 5*20", "claimed_answer":false }.
- GOOD NUMBER REWRITE: { "answer_type":"number", "question":"Combien de billes Luc a-t-il ? Luc a 4 boîtes de 25 billes.", "check_expression":"4*25", "claimed_answer":100 }.`;

const REGULAR_ER_VERB_BANK = [
  "aimer",
  "apporter",
  "arriver",
  "chercher",
  "chanter",
  "colorier",
  "coller",
  "compter",
  "couper",
  "danser",
  "dessiner",
  "donner",
  "entrer",
  "fermer",
  "garder",
  "jouer",
  "laver",
  "marcher",
  "monter",
  "montrer",
  "parler",
  "passer",
  "penser",
  "porter",
  "pousser",
  "ranger",
  "regarder",
  "rester",
  "rouler",
  "sauter",
  "tomber",
  "tourner",
  "travailler",
  "trouver",
  "visiter",
];

const MATH_PROMPT = (subSkillsList: string, language: string, schoolContext: string) => `You are an expert elementary teacher. Generate 6 math practice items (${language}) for these sub-skills: ${subSkillsList}. Distribute evenly across sub-skills.

WORKSHEET / SCHOOL CONTEXT TO PRESERVE:
${schoolContext}

CRITICAL SCHOOL-ALIGNMENT RULES:
- Use the same classroom method/representation when appropriate. If the worksheet uses labels such as c/d/u, number-line jumps, decomposition, columns, tables, grids, or specific grammar terms, reuse those words/labels in same-form and near-transfer items.
- Same-form items MUST look like the worksheet's exercise forms. If the worksheet is c-d-u place value, do NOT turn it into generic word problems about packets, students, balloons, pens, or shopping.
- If the concept title combines multiple areas, prioritize the worksheet method and question forms over the broad title.
- Generate a mix of practice modes:
  1. same_form: looks like the worksheet form, but with new values.
  2. near_transfer: same method, slightly different layout or numbers.
  3. far_transfer: same underlying skill in a modified context once the method is clear.
- Do NOT treat the scanned worksheet as proficiency evidence. It is context for tutoring and practice generation.

Each item MUST be SELF-CONTAINED — every number the child needs IN THE QUESTION TEXT. Vary real-world contexts only for far_transfer items where that does not erase the worksheet method.
${MATH_ANSWERABILITY_RULES}

STRUCTURE:
{
  "kind":"math",
  "answer_type":"number"|"yesno",
  "sub_skill":"<which sub_skill>",
  "unit":"€"|"" (€ if the answer is a money amount; "" if a plain count like number of items),
  "practice_mode":"same_form"|"near_transfer"|"far_transfer",
  "question":"<COMPLETE exercise in ${language} with every numeric value. For same_form, copy the worksheet-style task shape instead of writing a generic word problem. Use French comma decimals: 5,20 € not 5.20 €.>",
  "check_expression":"<expression using exact numbers from question in standard decimal form (5.20 not 5,20); arithmetic or boolean>",
  "claimed_answer":<number or boolean>
}
Return ONLY JSON array:
[...]`;

const MATH_TOPUP_PROMPT = (subSkill: string, language: string, schoolContext: string) => `Generate 4 more math practice items (${language}) focused ONLY on: "${subSkill}".

WORKSHEET / SCHOOL CONTEXT TO PRESERVE:
${schoolContext}

Use the same classroom method/representation where appropriate, then vary slightly. If the worksheet is c-d-u place value, do NOT turn it into generic multiplication or shopping word problems. Every number the child needs IN THE QUESTION TEXT.
${MATH_ANSWERABILITY_RULES}
Structure:
{
  "kind":"math",
  "answer_type":"number"|"yesno",
  "sub_skill":"${subSkill}",
  "unit":"€"|"" (€ if the answer is money; "" if a count),
  "practice_mode":"same_form"|"near_transfer"|"far_transfer",
  "question":"<exercise with all numbers stated>",
  "check_expression":"<expression>",
  "claimed_answer":<number or boolean>
}
Return ONLY JSON array: [...]`;

const LANGUAGE_PROMPT = (subSkillsList: string, language: string, conceptLabel: string, subSkillStrings: string[], schoolContext: string, avoid: string[] = []) => {
  const avoidStr = avoid.length > 0 ? `Do NOT reuse any word from this avoid list (already shown this episode): ${avoid.join(", ")}.` : "";
  return `You are an expert French/English teacher. Generate 8 grammar/language items for: ${subSkillsList}. Distribute evenly. Constrain to taught RULE/SCOPE (NO irregulars/exceptions beyond scope).

WORKSHEET / SCHOOL CONTEXT TO PRESERVE:
${schoolContext}

ON-CONCEPT CONSTRAINT (CRITICAL):
- Every question must practice ONLY this concept: "${conceptLabel}".
- Use ONLY these sub_skills: ${subSkillStrings.join(", ")}.
- Do NOT generate any other grammatical transformation — NO gender/féminin, NO conjugation/tense, NO synonyms/antonyms, NO definitions.
- If the sub_skills are about plural formation, every question must ask to form a plural.
- Write every question fully in ${language}. NO code-switching or English mixed in.
- Preserve worksheet form/method where appropriate. If the worksheet uses a conjugation grid, sentence frame, table, labels, or specific school grammar wording, generate some same-form items before modified transfer items.

VOCABULARY CONSTRAINT:
- Use a WIDE variety of distinct, common CE1 nouns drawn from many categories — animals, objects, food, school, nature, family, clothes, the home, etc.
- ${avoidStr}
- No repeated words within the batch.

CRITICAL WORDING RULE:
- ALWAYS wrap the target word/token in « » guillemets (French quotes) or double-quotes if unavailable.
- NEVER use phrases like "le mot seul" (ambiguous — reads as if "seul" is the target).
- Use "(juste le mot)" ONLY if a format hint is needed; NEVER "seul".
- Statement format: State the transformation instruction, THEN the target word in quotes. E.g., "Mets ce mot au pluriel : « chat »"

STRUCTURE:
{
  "kind":"reference",
  "sub_skill":"<EXACTLY one of: ${subSkillStrings.join(", ")} — copy the string verbatim>",
  "practice_mode":"same_form"|"near_transfer"|"far_transfer",
  "question":"<exercise in ${language}: state instruction, then target word in « ». MUST practice ONLY the concept "${conceptLabel}". E.g. 'Mets ce mot au pluriel : « chien »'>",
  "expected_answer":"<ONE WORD, no article, lowercase, no punctuation>"
}
Return ONLY JSON array: [...]`};


const LANGUAGE_TOPUP_PROMPT = (subSkill: string, language: string, conceptLabel: string, schoolContext: string, avoid: string[] = []) => {
  const avoidStr = avoid.length > 0 ? `Do NOT reuse any word from this avoid list (already shown this episode): ${avoid.join(", ")}.` : "";
  return `Generate 4 more grammar/language items (${language}) focused ONLY on: "${subSkill}". Constrain to taught RULE (NO irregulars/exceptions beyond scope).

WORKSHEET / SCHOOL CONTEXT TO PRESERVE:
${schoolContext}

ON-CONCEPT CONSTRAINT (CRITICAL):
- Every question must practice ONLY this concept: "${conceptLabel}".
- Use sub_skill: "${subSkill}" for every item.
- Do NOT generate any other grammatical transformation — NO gender/féminin, NO conjugation/tense, NO synonyms/antonyms, NO definitions.
- Write every question fully in ${language}. NO code-switching or English mixed in.
- Preserve worksheet form/method where appropriate, then vary slightly.

VOCABULARY CONSTRAINT:
- Use a WIDE variety of distinct, common CE1 nouns drawn from many categories — animals, objects, food, school, nature, family, clothes, the home, etc.
- ${avoidStr}
- No repeated words within the batch.

CRITICAL WORDING RULE:
- ALWAYS wrap the target word/token in « » guillemets (French quotes) or double-quotes if unavailable.
- NEVER use phrases like "le mot seul" or "the word alone" — these are ambiguous.
- Use "(juste le mot)" ONLY if a format hint is needed.
- Statement format: State the transformation instruction, THEN the target word in quotes. E.g., "Mets ce mot au pluriel : « chat »"

STRUCTURE:
{
  "kind":"reference",
  "sub_skill":"${subSkill}",
  "practice_mode":"same_form"|"near_transfer"|"far_transfer",
  "question":"<exercise in ${language}: state instruction, then target word in « ». MUST practice ONLY the concept "${conceptLabel}". E.g. 'Mets ce mot au pluriel : « chien »'>",
  "expected_answer":"<ONE WORD, no article, lowercase, no punctuation>"
}
Return ONLY JSON array: [...]`};


const LANGUAGE_VERIFY_PROMPT = (language: string, questions: string[]) => `You are a student learning French/English grammar. Answer each question by giving ONLY the minimal form requested: ONE WORD, no article, no punctuation, lowercase. Return JSON with answers in the same order.

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return ONLY this JSON (no explanation):
{
  "answers": [
    { "i": 1, "answer": "<minimal form: one word, no article, lowercase>" },
    { "i": 2, "answer": "<minimal form>" },
    ...
  ]
}`;

// Helper: check if language is French (robust)
function isFrench(language: string): boolean {
  const lower = (language ?? "").toLowerCase();
  return lower.includes("fran") || lower.startsWith("fr");
}

// Helper: check if language is English (robust)
function isEnglish(language: string): boolean {
  const lower = (language ?? "").toLowerCase();
  return lower.includes("angl") || lower.includes("engl") || lower.startsWith("en");
}

// Normalize text for language answer comparison
function normalizeAnswerText(text: string): string {
  let normalized = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/'/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized.replace(/^(le|la|les|l'|un|une|des|the|a|an)\s+/i, "");
  normalized = normalized.replace(/[.,!?;:]+$/, "");

  return normalized;
}

// Extract numbers from text (French comma decimals)
function extractNumbersFromText(text: string): Set<number> {
  const numbers = new Set<number>();
  const regex = /\d+[.,]\d+|\d+/g;
  const matches = text.match(regex) || [];
  for (const match of matches) {
    const normalized = match.replace(",", ".");
    const num = parseFloat(normalized);
    if (!isNaN(num)) {
      numbers.add(num);
    }
  }
  return numbers;
}

// Extract numeric literals from expression
function extractNumbersFromExpression(expr: string): Set<number> {
  const numbers = new Set<number>();
  const regex = /\d+\.?\d*/g;
  const matches = expr.match(regex) || [];
  for (const match of matches) {
    const num = parseFloat(match);
    if (!isNaN(num)) {
      numbers.add(num);
    }
  }
  return numbers;
}

function normalizeQuestionForGate(question: string): string {
  return String(question ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mathAnswerabilityIssue(item: Record<string, unknown>, computed?: unknown): string | null {
  const answerType = String(item.answer_type ?? "");
  const claimedAnswer = item.claimed_answer;
  const q = normalizeQuestionForGate(String(item.question ?? ""));

  if (answerType === "yesno") {
    if (typeof claimedAnswer !== "boolean") return "yesno claimed_answer is not boolean";
    if (computed !== undefined && typeof computed !== "boolean") {
      return "yesno check_expression did not compute a boolean";
    }
    return null;
  }

  if (answerType !== "number") {
    return `unsupported answer_type ${answerType || "(missing)"}`;
  }

  if (typeof claimedAnswer !== "number" || !Number.isFinite(claimedAnswer)) {
    return "number claimed_answer is not a finite number";
  }
  if (computed !== undefined && (typeof computed !== "number" || !Number.isFinite(computed))) {
    return "number check_expression did not compute a finite number";
  }

  const asksActorChoice = /\b(qui|lequel|laquelle|lesquels|lesquelles|who|which)\b/.test(q);
  const asksQuelChoice =
    /\b(quel|quelle|quels|quelles)\b/.test(q) &&
    !/\b(quel|quelle|quels|quelles)\s+(nombre|numero)\b/.test(q);
  const asksHowMuchToo = /\bet\s+combien\b|\band\s+how\s+(many|much)\b/.test(q);
  const comparesCollections = /\b(plus|moins|more|less|grand|petit|larger|smaller)\b/.test(q);
  const presupposesDifference =
    /\bde\s+plus\s+que\b|\bde\s+moins\s+que\b|\bmore\s+than\b|\bless\s+than\b/.test(q);
  const equalityOutcome =
    /\b(egal|egale|egaux|egalite|aucun|personne|equal|neither|none)\b/.test(q) ||
    (comparesCollections && /\b(meme|pareil|same)\b/.test(q));

  if ((asksActorChoice || asksQuelChoice) && asksHowMuchToo) {
    return "number question asks a multi-part which/who plus amount answer";
  }
  if (asksActorChoice) {
    return "number question asks for a person or which choice";
  }
  if (asksQuelChoice && comparesCollections) {
    return "number question asks which comparison choice";
  }
  if (presupposesDifference) {
    return "number comparison presupposes a non-equal winner";
  }
  if (equalityOutcome) {
    return "number question has an equality/neither/same outcome";
  }

  return null;
}

// Deterministic answer for "do I have enough money?" word problems.
// true=Oui, false=Non, null=pattern not recognized (fall back to existing check).
function affordabilityAnswer(question: string): boolean | null {
  const q = question.toLowerCase().replace(/[\u202f\u00a0]/g, " ");
  const EURO = "\u20ac";
  const isAfford =
    /assez d['\u2019]argent/.test(q) ||
    /as[- ]tu assez/.test(q) ||
    /a[- ]t[- ]il assez/.test(q) ||
    /a[- ]t[- ]elle assez/.test(q) ||
    /peux[- ]tu (l['\u2019]|les )?ach/.test(q) ||
    /peux[- ]tu payer/.test(q) ||
    /peut[- ]il .*ach/.test(q) ||
    /peut[- ]elle .*ach/.test(q);
  if (!isAfford) return null;

  const budgetRe = new RegExp(
    "(?:tu as|j['\u2019]ai|il a|elle a|on a|nous avons|tu disposes de|avec)\\s+(\\d+(?:[.,]\\d+)?)\\s*" + EURO
  );
  const budgetMatch = q.match(budgetRe);
  if (!budgetMatch) return null;

  const budget = parseFloat(budgetMatch[1].replace(",", "."));
  const costRe = new RegExp("co[u\u00fb]te(?:nt)?\\s+(\\d+(?:[.,]\\d+)?)\\s*" + EURO, "g");
  const costs: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = costRe.exec(q)) !== null) {
    costs.push(parseFloat(m[1].replace(",", ".")));
  }
  if (costs.length === 0) return null;

  const buysAll =
    costs.length === 1 ||
    /les deux|tous les deux|ensemble|les trois|\u00e0 la fois/.test(q);
  if (!buysAll) return null;

  const total = costs.reduce((a, b) => a + b, 0);
  return total <= budget + 1e-9;
}

function normalizePlainText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function conceptScopeText(concept: Record<string, unknown>, allSubSkills: string[]): string {
  const subSkillText = allSubSkills.join(" ");
  const descriptions = ((concept.sub_skills as Array<{ description?: string }>) || [])
    .map((s) => s.description || "")
    .join(" ");
  return normalizePlainText(`${String(concept.label ?? "")} ${String(concept.description ?? "")} ${subSkillText} ${descriptions}`);
}

function schoolContextText(concept: Record<string, unknown>): string {
  const schoolMethod = (concept.school_method ?? {}) as {
    name?: string;
    labels?: string[];
    meaning?: Record<string, string>;
    when_to_use?: string;
  };
  const questionForms = Array.isArray(concept.question_forms)
    ? concept.question_forms as Array<{ name?: string; description?: string; same_form_prompt?: string }>
    : [];
  const practiceModes = Array.isArray(concept.practice_modes)
    ? concept.practice_modes
    : ["same_form", "near_transfer", "far_transfer"];

  const meaning = schoolMethod.meaning && Object.keys(schoolMethod.meaning).length > 0
    ? Object.entries(schoolMethod.meaning).map(([label, value]) => `${label}=${value}`).join(", ")
    : "";
  const forms = questionForms
    .map((form) => [
      form.name ? `Form: ${form.name}` : "",
      form.description ? `Description: ${form.description}` : "",
      form.same_form_prompt ? `Same-form generation: ${form.same_form_prompt}` : "",
    ].filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");

  const lines = [
    `Concept: ${String(concept.label ?? "")}`,
    concept.description ? `Description: ${String(concept.description)}` : "",
    schoolMethod.name ? `School method: ${schoolMethod.name}` : "School method: not specified",
    schoolMethod.labels?.length ? `Visible labels/notation: ${schoolMethod.labels.join(", ")}` : "",
    meaning ? `Label meanings: ${meaning}` : "",
    schoolMethod.when_to_use ? `When to use method: ${schoolMethod.when_to_use}` : "",
    forms ? `Worksheet question forms:\n${forms}` : "Worksheet question forms: not specified",
    `Practice modes requested: ${practiceModes.join(", ")}`,
    "Evidence policy: context_only. Use this scan as school context, not mastery/proficiency evidence.",
  ].filter(Boolean);

  return lines.join("\n");
}

function isCduPlaceValuePractice(concept: Record<string, unknown>, allSubSkills: string[]): boolean {
  const schoolMethod = (concept.school_method ?? {}) as {
    name?: string;
    labels?: string[];
    meaning?: Record<string, string>;
  };
  const forms = Array.isArray(concept.question_forms)
    ? concept.question_forms as Array<{ name?: string; description?: string; same_form_prompt?: string }>
    : [];
  const methodText = [
    schoolMethod.name,
    ...(schoolMethod.labels ?? []),
    ...Object.keys(schoolMethod.meaning ?? {}),
    ...Object.values(schoolMethod.meaning ?? {}),
    ...forms.flatMap((form) => [form.name, form.description, form.same_form_prompt]),
    concept.label,
    concept.description,
    ...allSubSkills,
  ].join(" ");
  const scope = normalizePlainText(methodText);
  const hasCduLabels =
    /\bc\b/.test(scope) &&
    /\bd\b/.test(scope) &&
    /\bu\b/.test(scope) &&
    (scope.includes("centaine") || scope.includes("dizaine") || scope.includes("unite"));
  return hasCduLabels || scope.includes("c-d-u") || scope.includes("cdu");
}

function cduValue(c: number, d: number, u: number): number {
  return c * 100 + d * 10 + u;
}

function cduText(c: number, d: number, u: number): string {
  return `${c}c + ${d}d + ${u}u`;
}

function cduHint(
  rows: Array<{ label: string; c: number | string; d: number | string; u: number | string }>,
  steps: string[]
): Record<string, unknown> {
  return {
    title: "Aide avec c, d, u",
    visual_rows: rows.map((row) => ({
      label: row.label,
      c: row.c,
      d: row.d,
      u: row.u,
    })),
    steps,
  };
}

function buildCduPlaceValuePractice(
  concept: Record<string, unknown>,
  allSubSkills: string[],
  maxItems: number,
  sessionSeed: string
): Record<string, unknown>[] {
  const seed = hashString(`${JSON.stringify(concept)}:${sessionSeed || "cdu-place-value"}`);
  const subSkills = allSubSkills.length > 0 ? allSubSkills : ["Numération c-d-u"];
  const skillFor = (hint: string, fallbackIndex: number) => {
    const normalizedHint = normalizePlainText(hint);
    return subSkills.find((skill) => normalizePlainText(skill).includes(normalizedHint)) ||
      subSkills[fallbackIndex % subSkills.length];
  };
  const rotate = (index: number, min: number, span: number) => min + ((seed + index * 7) % span);
  const items: Record<string, unknown>[] = [];
  const valueItems = [
    { c: rotate(1, 1, 5), d: rotate(2, 1, 8), u: rotate(3, 0, 9) },
    { c: rotate(4, 2, 5), d: rotate(5, 0, 9), u: rotate(6, 1, 8) },
    { c: rotate(7, 1, 6), d: rotate(8, 2, 7), u: rotate(9, 2, 7) },
  ];

  for (const [index, row] of valueItems.entries()) {
    items.push({
      kind: "math",
      answer_type: "number",
      sub_skill: skillFor("unite", 0),
      unit: "",
      practice_mode: "same_form",
      question: `Combien d'unités au total représente ${cduText(row.c, row.d, row.u)} ?`,
      answer: cduValue(row.c, row.d, row.u),
      verified: true,
      hint: cduHint([{ label: "Nombre", ...row }], [
        `${row.c}c = ${row.c * 100} unités`,
        `${row.d}d = ${row.d * 10} unités`,
        `${row.u}u = ${row.u} unité${row.u > 1 ? "s" : ""}`,
      ]),
    });

    const digit = index === 0 ? "centaines" : index === 1 ? "dizaines" : "unités";
    const answer = index === 0 ? row.c : index === 1 ? row.d : row.u;
    items.push({
      kind: "math",
      answer_type: "number",
      sub_skill: skillFor(digit, 0),
      unit: "",
      practice_mode: "same_form",
      question: `Dans ${cduText(row.c, row.d, row.u)}, combien y a-t-il de ${digit} ?`,
      answer,
      verified: true,
      hint: cduHint([{ label: "Nombre", ...row }], [
        "Regarde la colonne demandée.",
        "c = centaines, d = dizaines, u = unités.",
      ]),
    });
  }

  const comparisons = [
    {
      a: { c: rotate(10, 2, 5), d: rotate(11, 1, 8), u: rotate(12, 0, 9) },
      b: { c: rotate(13, 1, 6), d: rotate(14, 0, 9), u: rotate(15, 1, 8) },
    },
    {
      a: { c: rotate(16, 1, 5), d: rotate(17, 2, 7), u: rotate(18, 1, 8) },
      b: { c: rotate(19, 1, 5), d: rotate(20, 3, 6), u: rotate(21, 0, 9) },
    },
    {
      a: { c: rotate(22, 3, 4), d: rotate(23, 0, 9), u: rotate(24, 2, 7) },
      b: { c: rotate(25, 2, 5), d: rotate(26, 1, 8), u: rotate(27, 0, 9) },
    },
  ];

  for (const pair of comparisons) {
    const aValue = cduValue(pair.a.c, pair.a.d, pair.a.u);
    const bValue = cduValue(pair.b.c, pair.b.d, pair.b.u);
    items.push({
      kind: "math",
      answer_type: "yesno",
      sub_skill: skillFor("comparer", 0),
      unit: "",
      practice_mode: "same_form",
      question: `${cduText(pair.a.c, pair.a.d, pair.a.u)} représente ${aValue} unités. ${cduText(pair.b.c, pair.b.d, pair.b.u)} représente ${bValue} unités. Est-ce que ${cduText(pair.a.c, pair.a.d, pair.a.u)} est plus grand que ${cduText(pair.b.c, pair.b.d, pair.b.u)} ?`,
      answer: aValue > bValue ? "Oui" : "Non",
      verified: true,
      hint: cduHint([
        { label: "1", ...pair.a },
        { label: "2", ...pair.b },
      ], [
        "Compare d'abord les centaines.",
        "Si les centaines sont pareilles, compare les dizaines.",
        "Si les dizaines sont pareilles, compare les unités.",
      ]),
    });
  }

  const missingParts = [
    { c: rotate(28, 1, 5), d: rotate(29, 1, 8), u: rotate(30, 0, 9), missing: "c" },
    { c: rotate(31, 2, 5), d: rotate(32, 0, 9), u: rotate(33, 1, 8), missing: "d" },
    { c: rotate(34, 1, 6), d: rotate(35, 1, 8), u: rotate(36, 2, 7), missing: "u" },
  ];

  for (const row of missingParts) {
    const answer = row.missing === "c" ? row.c : row.missing === "d" ? row.d : row.u;
    const shown = row.missing === "c"
      ? `___c + ${row.d}d + ${row.u}u`
      : row.missing === "d"
        ? `${row.c}c + ___d + ${row.u}u`
        : `${row.c}c + ${row.d}d + ___u`;
    items.push({
      kind: "math",
      answer_type: "number",
      sub_skill: skillFor("completer", 1),
      unit: "",
      practice_mode: "near_transfer",
      question: `Complète : ${shown} = ${cduValue(row.c, row.d, row.u)} unités. Quel nombre manque ?`,
      answer,
      verified: true,
      hint: cduHint([{
        label: "À compléter",
        c: row.missing === "c" ? "?" : row.c,
        d: row.missing === "d" ? "?" : row.d,
        u: row.missing === "u" ? "?" : row.u,
      }], [
        "Utilise les colonnes c, d, u.",
        "Cherche seulement le chiffre caché, pas tout le nombre.",
      ]),
    });
  }

  return items.slice(0, Math.max(1, maxItems));
}

function isLikelyConjugationPractice(concept: Record<string, unknown>, allSubSkills: string[]): boolean {
  const scope = conceptScopeText(concept, allSubSkills);
  return (
    scope.includes("conjug") ||
    scope.includes("verbe") ||
    scope.includes("verb") ||
    scope.includes("futur") ||
    scope.includes("present") ||
    scope.includes("tense")
  );
}

function conjugationSubSkill(concept: Record<string, unknown>, allSubSkills: string[]): string {
  const scope = conceptScopeText(concept, allSubSkills);
  if (scope.includes("futur")) return "Conjuguer au futur simple";
  if (scope.includes("imparfait")) return "Conjuguer a l'imparfait";
  if (scope.includes("passe compose")) return "Conjuguer au passe compose";
  if (scope.includes("present")) return "Conjuguer au present";
  return "Conjuguer le verbe";
}

function conjugationTense(concept: Record<string, unknown>, allSubSkills: string[]): "future" | "present" {
  const scope = conceptScopeText(concept, allSubSkills);
  return scope.includes("futur") ? "future" : "present";
}

function conjugationTenseLabel(tense: "future" | "present"): string {
  return tense === "future" ? "futur simple" : "présent";
}

function regularErForm(verb: string, pronoun: string, tense: "future" | "present"): string {
  const stem = verb.endsWith("er") ? verb.slice(0, -2) : verb;
  if (tense === "future") {
    const endings: Record<string, string> = {
      "je": "ai",
      "tu": "as",
      "il": "a",
      "elle": "a",
      "nous": "ons",
      "vous": "ez",
      "ils": "ont",
      "elles": "ont",
    };
    return `${verb}${endings[pronoun] || "a"}`;
  }

  const endings: Record<string, string> = {
    "je": "e",
    "tu": "es",
    "il": "e",
    "elle": "e",
    "nous": "ons",
    "vous": "ez",
    "ils": "ent",
    "elles": "ent",
  };
  return `${stem}${endings[pronoun] || "e"}`;
}

function startsWithVowelSound(word: string): boolean {
  return /^[aeiouyh]/i.test(word);
}

function subjectBlankForVerb(pronoun: string, verb: string): string {
  if (pronoun === "je" && startsWithVowelSound(verb)) return "j'___";
  return `${pronoun} ___`;
}

function displayPronoun(pronoun: string): string {
  if (pronoun === "il/elle") return "il";
  if (pronoun === "ils/elles") return "ils";
  return pronoun;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

type ConjugationBankRow = {
  verb: string;
  verb_group: string;
  tense: string;
  pronoun: string;
  correct_answer: string;
};

async function fetchConjugationBankItems(
  supabase: ReturnType<typeof createClient>,
  language: string,
  tense: "future" | "present",
  subSkill: string,
  maxItems: number,
  avoid: string[],
  sessionSeed: string
): Promise<Record<string, unknown>[]> {
  const languageCode = isFrench(language) ? "fr-FR" : "en-CA";
  const tenseLabel = conjugationTenseLabel(tense);
  const avoidSet = new Set(avoid.map((w) => normalizeAnswerText(w)));
  const seed = hashString(`${languageCode}:${tenseLabel}:${subSkill}:${sessionSeed}`);

  const { data, error } = await supabase
    .from("conjugation_questions")
    .select("verb, verb_group, tense, pronoun, correct_answer")
    .eq("language", languageCode)
    .eq("verb_group", "groupe_1")
    .eq("tense", tenseLabel)
    .limit(600);

  if (error || !data || data.length === 0) {
    if (error) console.error("[generate-practice] conjugation bank fetch error:", error);
    return [];
  }

  const rowsByVerb = new Map<string, ConjugationBankRow[]>();
  for (const row of data as ConjugationBankRow[]) {
    if (!row.verb || !row.correct_answer || avoidSet.has(normalizeAnswerText(row.correct_answer))) continue;
    const rows = rowsByVerb.get(row.verb) || [];
    rows.push(row);
    rowsByVerb.set(row.verb, rows);
  }

  const verbs = Array.from(rowsByVerb.keys()).sort((a, b) => a.localeCompare(b));
  const items: Record<string, unknown>[] = [];
  const usedVerbs = new Set<string>();
  const offset = verbs.length ? (seed + avoid.length) % verbs.length : 0;

  for (let i = 0; items.length < maxItems && i < verbs.length * 2; i++) {
    const verb = verbs[(offset + i * 7) % verbs.length];
    if (!verb || usedVerbs.has(verb)) continue;

    const rows = rowsByVerb.get(verb) || [];
    const row = rows[(seed + i) % rows.length];
    if (!row) continue;

    const pronoun = displayPronoun(row.pronoun);
    const prompt =
      tense === "future"
        ? `Demain, ${subjectBlankForVerb(pronoun, row.verb)}. Mets « ${row.verb} » au futur simple.`
        : `Aujourd'hui, ${subjectBlankForVerb(pronoun, row.verb)}. Mets « ${row.verb} » au présent.`;

    usedVerbs.add(verb);
    items.push({
      kind: "reference",
      sub_skill: subSkill,
      question: prompt,
      answer: row.correct_answer,
      verified: true,
    });
  }

  return items;
}

async function generateConjugationPractice(
  supabase: ReturnType<typeof createClient>,
  concept: Record<string, unknown>,
  language: string,
  allSubSkills: string[],
  maxItems: number,
  avoid: string[] = [],
  sessionSeed = ""
): Promise<Response> {
  const tense = conjugationTense(concept, allSubSkills);
  const subSkill = conjugationSubSkill(concept, allSubSkills);
  const seedValue =
    sessionSeed ||
    `${JSON.stringify(concept)}:${new Date().toISOString().slice(0, 10)}`;
  const bankItems = await fetchConjugationBankItems(supabase, language, tense, subSkill, maxItems, avoid, seedValue);

  if (bankItems.length > 0) {
    return json({
      practice: bankItems,
      debug: {
        generated: bankItems.length,
        kept: bankItems.length,
        deterministic: "conjugation_questions",
        tense: conjugationTenseLabel(tense),
        verb_group: "groupe_1",
        seed: seedValue,
      },
    }, 200);
  }

  const avoidSet = new Set(avoid.map((w) => normalizeAnswerText(w)));
  const pronouns = ["je", "tu", "il", "elle", "nous", "vous", "ils", "elles"];
  const items: Record<string, unknown>[] = [];
  const usedVerbs = new Set<string>();
  const fallbackSeed = hashString(seedValue);

  for (let i = 0; items.length < maxItems && i < REGULAR_ER_VERB_BANK.length * pronouns.length; i++) {
    const verb = REGULAR_ER_VERB_BANK[(fallbackSeed + i * 7) % REGULAR_ER_VERB_BANK.length];
    if (usedVerbs.has(verb) && usedVerbs.size < REGULAR_ER_VERB_BANK.length) continue;
    const pronoun = pronouns[(fallbackSeed + i) % pronouns.length];
    const subjectBlank = subjectBlankForVerb(pronoun, verb);
    const answer = regularErForm(verb, pronoun, tense);
    if (avoidSet.has(normalizeAnswerText(answer))) continue;
    usedVerbs.add(verb);

    const prompt =
      tense === "future"
        ? `Demain, ${subjectBlank}. Mets « ${verb} » au futur simple.`
        : `Aujourd'hui, ${subjectBlank}. Mets « ${verb} » au présent.`;

    items.push({
      kind: "reference",
      sub_skill: subSkill,
      question: prompt,
      answer,
      verified: true,
    });
  }

  return json({
    practice: items,
    debug: {
      generated: items.length,
      kept: items.length,
      deterministic: "regular_er_conjugation",
      verb_bank_size: REGULAR_ER_VERB_BANK.length,
    },
  }, 200);
}

// Check which sub-skills have zero verified items
function getMissingSubSkills(allSubSkills: string[], verifiedItems: Record<string, unknown>[]): string[] {
  const coveredSubSkills = new Set(verifiedItems.map((item) => item.sub_skill as string));
  return allSubSkills.filter((skill) => !coveredSubSkills.has(skill));
}

// Select final items: prefer diversity
function selectFinalItems(
  verifiedItems: Record<string, unknown>[],
  allSubSkills: string[],
  maxItems: number = 5
): { final: Record<string, unknown>[]; uncovered: string[] } {
  const final: Record<string, unknown>[] = [];
  const usedSubSkills = new Set<string>();

  // First pass: one item per sub-skill
  for (const skill of allSubSkills) {
    if (final.length >= maxItems) break;
    const item = verifiedItems.find((i) => i.sub_skill === skill && !final.includes(i));
    if (item) {
      final.push(item);
      usedSubSkills.add(skill);
    }
  }

  // Second pass: fill remaining slots
  for (const item of verifiedItems) {
    if (final.length >= maxItems) break;
    if (!final.includes(item)) {
      final.push(item);
      usedSubSkills.add(item.sub_skill as string);
    }
  }

  const uncovered = allSubSkills.filter((skill) => !usedSubSkills.has(skill));
  return { final, uncovered };
}

// Parse JSON from model response
function parseJsonResponse(raw: string): Record<string, unknown>[] | null {
  let cleanJson = raw.trim();
  if (cleanJson.startsWith("```")) {
    const endFence = cleanJson.lastIndexOf("```");
    if (endFence > 3) cleanJson = cleanJson.substring(cleanJson.indexOf("\n") + 1, endFence);
  }
  const cleaned = cleanJson.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "");
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;

  try {
    return JSON.parse(arrayMatch[0]);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  resetOpenAIChatBudget();

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const input = await req.json();
    const concept = input.concept as Record<string, unknown>;
    const language = input.language as string;
    const domain = input.domain as string || "math";
    const count = input.count as number || 5;
    const avoid = (input.avoid as string[]) || [];
    const sessionSeed = typeof input.sessionSeed === "string" ? input.sessionSeed : "";
    const authHeader = req.headers.get("authorization") || "";

    if (!concept || !language || !domain) {
      return json({ error: "concept, language, domain are required" }, 400);
    }

    const allSubSkills = (concept.sub_skills as Array<{label: string}>)?.map((s) => s.label) || [];
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined
    );

    if (domain === "math") {
      return await generateMathPractice(concept, language, allSubSkills, count, sessionSeed);
    } else if (domain === "language" && (isFrench(language) || isEnglish(language))) {
      if (isLikelyConjugationPractice(concept, allSubSkills)) {
        return await generateConjugationPractice(supabase, concept, language, allSubSkills, count, avoid, sessionSeed);
      }
      return await generateLanguagePractice(concept, language, allSubSkills, count, avoid);
    } else {
      return json({ practice: [], debug: { generated: 0, kept: 0, error: "unsupported_domain_language" } }, 200);
    }
  } catch (e) {
    console.error("[generate-practice] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

async function generateMathPractice(
  concept: Record<string, unknown>,
  language: string,
  allSubSkills: string[],
  maxItems: number,
  sessionSeed: string
): Promise<Response> {
  const subSkillsList = allSubSkills.join(", ");
  const schoolContext = schoolContextText(concept);
  const mathjs = await import("https://esm.sh/mathjs@12");
  const evaluate = mathjs.evaluate;

  let verifiedMathItems: Record<string, unknown>[] = [];
  let totalGenerated = 0;

  if (isCduPlaceValuePractice(concept, allSubSkills)) {
    const cduItems = buildCduPlaceValuePractice(concept, allSubSkills, maxItems, sessionSeed);
    console.log(
      "[generate-practice math] deterministic c-d-u items:",
      cduItems.map((item: any) => ({
        question: item.question,
        answer: item.answer,
        sub_skill: item.sub_skill,
      }))
    );
    return json({
      practice: cduItems,
      debug: {
        generated: cduItems.length,
        kept: cduItems.length,
        deterministic: "cdu_place_value",
      },
    }, 200);
  }

  // Initial generation
  const genRes = await callOpenAIChat(OPENAI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "user", content: MATH_PROMPT(subSkillsList, language, schoolContext) },
      ],
    }),
  });

  if (!genRes.ok) {
    console.error("[generate-practice] math gen error:", genRes.status);
    return json({ practice: [], debug: { generated: 0, kept: 0, error: "generation_failed" } }, 200);
  }

  const genData = await genRes.json();
  let candidateItems = parseJsonResponse(genData.choices?.[0]?.message?.content ?? "") || [];
  totalGenerated = candidateItems.length;

  // Verify candidates
  for (const item of candidateItems) {
    if (item.kind === "math") {
      try {
        const question = item.question as string;
        const checkExpr = item.check_expression as string;
        const answerType = item.answer_type as string;
        const claimedAnswer = item.claimed_answer;
        const preIssue = mathAnswerabilityIssue(item);
        if (preIssue) {
          console.log("[generate-practice] answerability guard dropped item:", preIssue, question.substring(0, 120));
          continue;
        }

        // Deterministic affordability override: compute "enough money?" from the
        // numbers instead of trusting the model.
        if (answerType === "yesno") {
          const det = affordabilityAnswer(question);
          if (det !== null) {
            item.answer = det ? "Oui" : "Non";
            item.verified = true;
            verifiedMathItems.push(item);
            continue;
          }
        }

        // GUARD: numeric verification
        const questionNumbers = extractNumbersFromText(question);
        const exprNumbers = extractNumbersFromExpression(checkExpr);

        let allNumbersInQuestion = true;
        for (const num of exprNumbers) {
          if (!questionNumbers.has(num)) {
            allNumbersInQuestion = false;
            break;
          }
        }

        if (!allNumbersInQuestion) continue;

        // Evaluate
        const computed = evaluate(checkExpr);
        const postIssue = mathAnswerabilityIssue(item, computed);
        if (postIssue) {
          console.log("[generate-practice] answerability guard dropped computed item:", postIssue, question.substring(0, 120));
          continue;
        }

        if (answerType === "yesno") {
          if (computed === claimedAnswer) {
            item.answer = computed ? "Oui" : "Non";
            item.verified = true;
            verifiedMathItems.push(item);
          }
        } else {
          if (Math.abs(computed as number - (claimedAnswer as number)) < 0.005) {
            item.answer = computed;
            item.verified = true;
            verifiedMathItems.push(item);
          }
        }
      } catch {
        // Skip on eval error
      }
    }
  }

  // Coverage check + top-up
  let missingSubSkills = getMissingSubSkills(allSubSkills, verifiedMathItems);

  for (const missingSkill of missingSubSkills) {
    const topupRes = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: MATH_TOPUP_PROMPT(missingSkill, language, schoolContext) },
        ],
      }),
    });

    if (topupRes.ok) {
      const topupData = await topupRes.json();
      const topupCandidates = parseJsonResponse(topupData.choices?.[0]?.message?.content ?? "") || [];

      for (const item of topupCandidates) {
        if (item.kind === "math") {
          try {
            const question = item.question as string;
            const checkExpr = item.check_expression as string;
            const answerType = item.answer_type as string;
            const claimedAnswer = item.claimed_answer;
            const preIssue = mathAnswerabilityIssue(item);
            if (preIssue) {
              console.log("[generate-practice] answerability guard dropped top-up item:", preIssue, question.substring(0, 120));
              continue;
            }

            // Deterministic affordability override: compute "enough money?" from the
            // numbers instead of trusting the model.
            if (answerType === "yesno") {
              const det = affordabilityAnswer(question);
              if (det !== null) {
                item.answer = det ? "Oui" : "Non";
                item.verified = true;
                verifiedMathItems.push(item);
                continue;
              }
            }

            const questionNumbers = extractNumbersFromText(question);
            const exprNumbers = extractNumbersFromExpression(checkExpr);

            let allNumbersInQuestion = true;
            for (const num of exprNumbers) {
              if (!questionNumbers.has(num)) {
                allNumbersInQuestion = false;
                break;
              }
            }

            if (!allNumbersInQuestion) continue;

            const computed = evaluate(checkExpr);
            const postIssue = mathAnswerabilityIssue(item, computed);
            if (postIssue) {
              console.log("[generate-practice] answerability guard dropped computed top-up item:", postIssue, question.substring(0, 120));
              continue;
            }

            if (answerType === "yesno") {
              if (computed === claimedAnswer) {
                item.answer = computed ? "Oui" : "Non";
                item.verified = true;
                verifiedMathItems.push(item);
              }
            } else {
              if (Math.abs(computed as number - (claimedAnswer as number)) < 0.005) {
                item.answer = computed;
                item.verified = true;
                verifiedMathItems.push(item);
              }
            }
          } catch {
            // Skip
          }
        }
      }

      totalGenerated += topupCandidates.length;
      missingSubSkills = getMissingSubSkills(allSubSkills, verifiedMathItems);
      if (missingSubSkills.length === 0) break;
    }
  }

  // Final selection
  const { final: finalItems, uncovered } = selectFinalItems(verifiedMathItems, allSubSkills, maxItems);

  // Clean up
  const cleanedItems = finalItems.map((item: Record<string, unknown>) => {
    const { check_expression, claimed_answer, context, ...rest } = item;
    return rest;
  });

  // Log returned practice items
  console.log(
    "[generate-practice math] returning items:",
    cleanedItems.map((item: any) => ({
      question: item.question,
      answer: item.answer,
      sub_skill: item.sub_skill,
    }))
  );

  return json({
    practice: cleanedItems,
    debug: {
      generated: totalGenerated,
      kept: cleanedItems.length,
      uncovered_subskills: uncovered.length > 0 ? uncovered : undefined,
    },
  }, 200);
}

async function generateLanguagePractice(
  concept: Record<string, unknown>,
  language: string,
  allSubSkills: string[],
  maxItems: number,
  avoid: string[] = []
): Promise<Response> {
  const conceptLabel = String(concept.label ?? "");
  const subSkillsList = allSubSkills.join(", ");
  const schoolContext = schoolContextText(concept);
  const avoidSet = new Set(avoid.map((w) => normalizeAnswerText(w)));

  let verifiedItems: Record<string, unknown>[] = [];
  let referenceCandidates: Record<string, unknown>[] = [];
  let totalGenerated = 0;

  // Initial generation
  const genRes = await callOpenAIChat(OPENAI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "user", content: LANGUAGE_PROMPT(subSkillsList, language, conceptLabel, allSubSkills, schoolContext, avoid) },
      ],
    }),
  });

  if (!genRes.ok) {
    console.error("[generate-practice] language gen error:", genRes.status);
    return json({ practice: [], debug: { generated: 0, kept: 0, error: "generation_failed", reference_candidates: [] } }, 200);
  }

  const genData = await genRes.json();
  let candidateItems = parseJsonResponse(genData.choices?.[0]?.message?.content ?? "") || [];
  totalGenerated = candidateItems.length;

  // Filter for on-concept items (sub_skill must match one of the provided sub_skills)
  const validSubSkillsNormalized = allSubSkills.map(s => s.toLowerCase().trim());
  const beforeFilter = candidateItems.length;
  candidateItems = candidateItems.filter((item) => {
    const itemSubSkill = String(item.sub_skill ?? "").toLowerCase().trim();
    const isOnConcept = validSubSkillsNormalized.includes(itemSubSkill);
    if (!isOnConcept) {
      console.log("[off-concept dropped]", { question: item.question, sub_skill: item.sub_skill });
    }
    return isOnConcept;
  });
  console.log("[language concept filter]", { generated: totalGenerated, after_filter: candidateItems.length, dropped: beforeFilter - candidateItems.length });

  // Verify via blind re-solve
  const questions = candidateItems.map((c) => c.question as string);

  const verifyRes = await callOpenAIChat(OPENAI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "user", content: LANGUAGE_VERIFY_PROMPT(language, questions) },
      ],
    }),
  });

  let solverAnswerArray: Array<{i: number; answer: string}> = [];

  if (verifyRes.ok) {
    const verifyData = await verifyRes.json();
    const verifyRaw = verifyData.choices?.[0]?.message?.content ?? "";

    try {
      const jsonMatch = verifyRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const solverAnswers = JSON.parse(jsonMatch[0]);
        solverAnswerArray = solverAnswers.answers || [];
      }
    } catch {
      console.log("[generate-practice] failed to parse solver response");
    }
  }

  // Match verified items and de-dup against avoid list
  const seenAnswers = new Set<string>();
  for (let i = 0; i < candidateItems.length; i++) {
    const item = candidateItems[i];
    const solverAnswer = solverAnswerArray.find((a) => a.i === i + 1)?.answer || "";

    const expectedNorm = normalizeAnswerText(item.expected_answer as string);
    const solverNorm = normalizeAnswerText(solverAnswer);
    const matched = expectedNorm === solverNorm;

    referenceCandidates.push({
      question: item.question,
      expected_answer: item.expected_answer,
      solver_answer: solverAnswer,
      matched,
    });

    if (matched && !avoidSet.has(expectedNorm) && !seenAnswers.has(expectedNorm)) {
      item.verified = true;
      item.answer = item.expected_answer;
      verifiedItems.push(item);
      seenAnswers.add(expectedNorm);
    }
  }

  // Coverage check + top-up
  let missingSubSkills = getMissingSubSkills(allSubSkills, verifiedItems);

  for (const missingSkill of missingSubSkills) {
    const topupRes = await callOpenAIChat(OPENAI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: LANGUAGE_TOPUP_PROMPT(missingSkill, language, conceptLabel, schoolContext, avoid) },
        ],
      }),
    });

    if (topupRes.ok) {
      const topupData = await topupRes.json();
      const topupCandidates = parseJsonResponse(topupData.choices?.[0]?.message?.content ?? "") || [];

      const topupQuestions = topupCandidates.map((c) => c.question as string);

      const topupVerifyRes = await callOpenAIChat(OPENAI_API_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: LANGUAGE_VERIFY_PROMPT(language, topupQuestions) },
          ],
        }),
      });

      if (topupVerifyRes.ok) {
        const topupVerifyData = await topupVerifyRes.json();
        const topupVerifyRaw = topupVerifyData.choices?.[0]?.message?.content ?? "";

        let topupSolverAnswerArray: Array<{i: number; answer: string}> = [];
        try {
          const jsonMatch = topupVerifyRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const topupSolverAnswers = JSON.parse(jsonMatch[0]);
            topupSolverAnswerArray = topupSolverAnswers.answers || [];
          }
        } catch {
          console.log("[generate-practice] failed to parse topup solver response");
        }

        for (let i = 0; i < topupCandidates.length; i++) {
          const item = topupCandidates[i];
          const solverAnswer = topupSolverAnswerArray.find((a) => a.i === i + 1)?.answer || "";

          const expectedNorm = normalizeAnswerText(item.expected_answer as string);
          const solverNorm = normalizeAnswerText(solverAnswer);

          if (expectedNorm === solverNorm && !avoidSet.has(expectedNorm) && !seenAnswers.has(expectedNorm)) {
            item.verified = true;
            item.answer = item.expected_answer;
            verifiedItems.push(item);
            seenAnswers.add(expectedNorm);
            referenceCandidates.push({
              question: item.question,
              expected_answer: item.expected_answer,
              solver_answer: solverAnswer,
              matched: true,
            });
          } else {
            referenceCandidates.push({
              question: item.question,
              expected_answer: item.expected_answer,
              solver_answer: solverAnswer,
              matched: false,
            });
          }
        }
      }

      totalGenerated += topupCandidates.length;
      missingSubSkills = getMissingSubSkills(allSubSkills, verifiedItems);
      if (missingSubSkills.length === 0) break;
    }
  }

  // Final selection
  const { final: finalItems, uncovered } = selectFinalItems(verifiedItems, allSubSkills, maxItems);

  // Clean up
  const cleanedItems = finalItems.map((item) => {
    const { expected_answer, ...rest } = item;
    return rest;
  });

  // Log returned practice items
  console.log(
    "[generate-practice language] returning items:",
    cleanedItems.map((item: any) => ({
      question: item.question,
      answer: item.answer,
      sub_skill: item.sub_skill,
    }))
  );

  return json({
    practice: cleanedItems,
    debug: {
      generated: totalGenerated,
      kept: cleanedItems.length,
      uncovered_subskills: uncovered.length > 0 ? uncovered : undefined,
      reference_candidates: referenceCandidates,
    },
  }, 200);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
