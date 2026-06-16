import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INITIAL_PROMPT = `You are an expert elementary teacher (ages 6–10). You are given a photo of a page — it may be a worksheet (filled or blank), a textbook page, or an explanatory sheet with no questions. Identify the DISTINCT sub-skills it teaches or practises from the actual question TYPES on the page. Do NOT invent sub-skills. Classify the domain. Respond with ONLY a JSON object (no markdown). ALL text must be in the page's language — never use English:
{
 "language": "<the page's language>",
 "domain": "math" | "language",
 "source_type": "worksheet" | "textbook" | "explanatory" | "spelling_list" | "other",
 "spelling_words": ["<only when source_type is spelling_list: each spelling-list entry exactly as written, preserving accents/articles/apostrophes>"],
 "grade_band": "<best guess, e.g. CP-CE1 or Grade 1-2>",
 "concept": {
   "label": "<short name in the page's language>",
   "description": "<1–2 sentences in the page's language>",
   "sub_skills": [ { "label": "<sub-skill name in page's language>", "description": "<1 sentence in page's language>" }, ... ]
 },
 "lesson": "<a short, warm, age-appropriate mini-lesson in the page's language; plain text, no markdown>",
 "practice": [ <exactly 6 items, DISTRIBUTED EVENLY across all sub_skills; each tagged with its sub_skill> ]
}
CRITICAL: Distribute the 6 practice items roughly evenly across ALL sub_skills — if there are 3 sub_skills, generate ~2 items for each. Do NOT cluster on one sub_skill.
SPELLING LIST RULE:
- If the page is mainly a list of words for the child to learn, classify it as source_type "spelling_list", domain "language".
- Do NOT call it "vocabulary" unless the page asks for definitions, synonyms, categories, or meanings.
- Extract the words/list entries into spelling_words exactly as written, preserving accents, apostrophes, and articles.
- For spelling_list pages, the concept label should be "Spelling list" in English or "Liste d'orthographe" in French.
- For spelling_list pages, practice items must be spelling prompts anchored ONLY to spelling_words, never invented vocabulary/meaning questions.
LANGUAGE LABEL RULE:
- If the page asks the child to conjugate verbs, the concept label MUST be a conjugation label in the page language, such as "Conjugaison" or "Conjuguer au présent". Do NOT label conjugation pages as "vocabulaire".
- Use "vocabulaire" / "vocabulary" ONLY when the page asks about meanings, definitions, synonyms, categories, or word knowledge.
Each practice MATH item MUST be SELF-CONTAINED — the question text includes EVERY number needed:
- { "kind":"math", "answer_type":"number"|"yesno", "sub_skill":"<which sub_skill>", "unit":"€"|"" (€ if the answer is a money amount; "" if a plain count), "question":"<COMPLETE word problem in page's language with EVERY numeric value stated explicitly. E.g. 'Un livre coûte 5,20 € et un cahier coûte 3,50 €. Si tu achètes un livre et un cahier, combien dépenses-tu en tout ?' or 'Tu as 15 €. Une paire de chaussures coûte 12 €. As-tu assez d'argent pour les chaussures ?'>", "check_expression":"<arithmetic or boolean expression using the exact numeric values stated in the question text (in standard decimal form, e.g., 5.20 not 5,20); no variable names, only literals>", "claimed_answer":<number for 'number' type, or boolean for 'yesno'> }
Other items (reference, open) can use simple text.
CRITICAL:
1. Derive sub_skills ONLY from question types on the page (don't invent).
2. Each math item INVENTS a fresh scenario (different items/prices than the sheet) — NO reuse of sheet values.
3. VARY the real-world contexts across items — rotate among everyday kid settings: school supplies (pencils, notebooks, erasers), toys (action figures, building blocks, board games), snacks/groceries (fruit, candy, juice, milk), sports gear (balls, skates, bikes), clothing (shoes, jackets, hats), books/comics. Do NOT stay only on the sheet's domain.
4. EVERY number the child needs MUST appear in the question text itself (use French comma decimals: 5,20 € not 5.20 €).
5. check_expression uses the SAME numbers as in the question, in standard decimal form (5.20 not 5,20).
6. Include a "how many can you buy" item where relevant (e.g., "Tu as 10 €. Un stylo coûte 2 €. Combien de stylos peux-tu acheter?").
7. Each item is distinct, NO duplicates; ALL text in page's language only.`;

const RETRY_PROMPT = (subSkillsList: string, language: string) => `Generate 4 more DISTINCT math practice items (${language}) for sub-skills: ${subSkillsList}. Distribute evenly across the sub-skills listed. EACH ITEM MUST BE SELF-CONTAINED — every number the child needs must be IN THE QUESTION TEXT. Vary contexts widely across everyday kid settings: school supplies, toys, snacks/groceries, sports gear, clothing, books. Structure:
{
  "kind":"math",
  "answer_type":"number"|"yesno",
  "sub_skill":"<which sub_skill>",
  "unit":"€"|"" (€ if the answer is money; "" if a count),
  "question":"<COMPLETE word problem in ${language} with every numeric value stated. Use French comma decimals (5,20 €) in the text. Example: 'Tu as 15 €. Un stylo coûte 2,50 €. Combien de stylos peux-tu acheter?'>",
  "check_expression":"<expression using the SAME numbers from the question, in standard decimal form (2.50 not 2,50); e.g., floor(15 / 2.50)>",
  "claimed_answer":<number or boolean>
}
Include affordability/how-many-can-you-buy items. Return ONLY the JSON array, NO EXPLANATION, ALL TEXT IN ${language}:
[...]`;

const LANGUAGE_PROMPT = (subSkillsList: string, language: string, conceptScope: string) => `You are an expert French/English teacher. Generate 8 grammar/language practice items for these sub-skills: ${subSkillsList}. CONSTRAIN each item to the RULE/SCOPE actually taught (NO irregulars, NO exceptions beyond what's taught). Grade-appropriate.

WORKSHEET SCOPE TO PRESERVE:
${conceptScope}

CRITICAL TASK-TYPE RULE:
- Match the ACTUAL task type on the worksheet, not merely the broad topic.
- If the worksheet is conjugation, every item MUST ask the learner to write the conjugated verb for a concrete pronoun and tense.
- For conjugation, expected_answer MUST be the conjugated verb form or requested conjugated phrase, never a subject pronoun such as je/tu/il/elle/nous/vous/ils/elles.
- Do NOT ask the learner to identify a subject pronoun, infinitive, tense name, grammar category, stem/radical, or ending/terminaison.
- For conjugation, do NOT use abstract grammar wording like "1ère personne du singulier". Use the actual pronoun in a short sentence.
- For conjugation, prefer fill-in-the-blank prompts a 7-year-old can answer, such as "Demain, je ___ . Mets « marcher » au futur simple.".
- For French regular future tense of -er verbs, use regular -er verbs and expected answers like "regardera", not "elle".

CRITICAL WORDING RULE:
- ALWAYS wrap the target word/token in « » guillemets (French quotes) or double-quotes if unavailable.
- NEVER use phrases like "le mot seul" (ambiguous — reads as if "seul" is the target).
- Use "(juste le mot)" ONLY if a format hint is needed; NEVER "seul".
- Statement format: State the transformation instruction, THEN the target word in quotes. E.g., "Mets ce mot au pluriel : « chien »"

Structure:
{
  "kind":"reference",
  "sub_skill":"<which sub_skill>",
  "question":"<exercise in ${language}: state instruction, then target word in « ». E.g. 'Mets ce mot au pluriel : « chien »'>",
  "expected_answer":"<ONE WORD, no article, lowercase, no punctuation>"
}
Return ONLY the JSON array, NO EXPLANATION, ALL TEXT IN ${language}:
[...]`;

const MATH_TOPUP_PROMPT = (subSkill: string, language: string) => `Generate 4 more math practice items (${language}) focused ONLY on the sub-skill: "${subSkill}". EACH ITEM MUST BE SELF-CONTAINED — every number the child needs must be IN THE QUESTION TEXT. Vary contexts (school supplies, toys, snacks, sports, clothing, books). Return ONLY the JSON array with structure { "kind":"math", "answer_type":"...", "sub_skill":"${subSkill}", "unit":"€"|"" (€ if money; "" if count), "question":"...", "check_expression":"...", "claimed_answer":... }:
[...]`;

const LANGUAGE_TOPUP_PROMPT = (subSkill: string, language: string, conceptScope: string) => `Generate 4 more grammar/language practice items (${language}) focused ONLY on the sub-skill: "${subSkill}". Constrain to the RULE taught (NO irregulars/exceptions beyond scope).

WORKSHEET SCOPE TO PRESERVE:
${conceptScope}

CRITICAL TASK-TYPE RULE:
- Match the ACTUAL worksheet task type.
- If this is conjugation practice, ask for the conjugated verb/form.
- Do NOT ask for a subject pronoun, infinitive, tense name, grammar category, stem/radical, or ending/terminaison.
- For conjugation, do NOT use abstract grammar wording like "1ère personne du singulier". Use the actual pronoun in a short sentence.
- For conjugation, prefer fill-in-the-blank prompts a 7-year-old can answer, such as "Demain, je ___ . Mets « marcher » au futur simple.".
- For French regular future tense of -er verbs, expected answers should be forms like "regardera", not pronouns like "elle".

CRITICAL WORDING RULE:
- ALWAYS wrap the target word/token in « » guillemets (French quotes) or double-quotes if unavailable.
- NEVER use phrases like "le mot seul" — these are ambiguous.
- Use "(juste le mot)" ONLY if a format hint is needed.
- Statement format: State the transformation instruction, THEN the target word in quotes. E.g., "Mets ce mot au pluriel : « chien »"

Structure { "kind":"reference", "sub_skill":"${subSkill}", "question":"<exercise in ${language}: state instruction, then target word in « ». E.g. 'Mets ce mot au pluriel : « chien »'>", "expected_answer":"<ONE WORD, no article, lowercase, no punctuation>" }. Return ONLY JSON array:
[...]`;

const LANGUAGE_VERIFY_PROMPT = (language: string, questions: string[]) => `You are a student learning French/English grammar. Answer each question below by giving ONLY the minimal form requested: ONE WORD, no article, no punctuation, lowercase. Return JSON with the answers in the same order.

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return ONLY this JSON (no explanation):
{
  "answers": [
    { "i": 1, "answer": "<minimal form: one word, no article, lowercase>" },
    { "i": 2, "answer": "<minimal form>" },
    ...
  ]
}`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const { image } = await req.json();
    if (!image) return json({ error: "image (data URL) is required" }, 400);

    // Initial call to generate concept + 6 practice items
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: [
            { type: "text", text: INITIAL_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ] },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[absorb-worksheet] OpenAI error", openaiRes.status, errText);
      return json({ error: "OpenAI request failed", status: openaiRes.status }, 502);
    }

    const data = await openaiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    console.log("[absorb-worksheet] RAW response (first 500 chars):", raw.substring(0, 500));

    let worksheet = parseJsonResponse(raw);
    if (!worksheet) {
      return json({ error: "Failed to parse worksheet absorption" }, 502);
    }

    const domainRaw = worksheet.domain as string || "math";
    const languageRaw = worksheet.language as string;

    const isFr = isFrench(languageRaw);
    const isEn = isEnglish(languageRaw);
    const spellingList = normalizeSpellingListWorksheet(worksheet);
    if (spellingList) {
      return json(spellingList, 200);
    }

    let pathTaken = "math";

    // Branch by domain and language
    if (domainRaw === "math") {
      // MATH PATH
      pathTaken = "math";
    } else if (isFr || isEn) {
      // LANGUAGE PATH: Generate and verify language items
      pathTaken = "reference";
      return await handleLanguagePractice(worksheet, languageRaw, domainRaw);
    } else {
      // Unsupported language for practice
      pathTaken = "unsupported";
      worksheet.practice = [];
      worksheet.debug = {
        generated: 0,
        kept: 0,
        domain_raw: domainRaw,
        language_raw: languageRaw,
        path_taken: pathTaken,
        reference_candidates: [],
      };
      worksheet.practice_not_supported_language = true;
      return json(worksheet, 200);
    }

    // MATH PATH: Existing logic
    const mathjs = await import("https://esm.sh/mathjs@12");
    const evaluate = mathjs.evaluate;
    let verifiedMathItems: Record<string, unknown>[] = [];
    let otherItems: Record<string, unknown>[] = [];
    let totalGenerated = worksheet.practice?.length ?? 0;

    if (worksheet.practice && Array.isArray(worksheet.practice)) {
      for (const item of worksheet.practice) {
        if (item.kind === "math") {
          try {
            const question = item.question as string;
            const checkExpr = item.check_expression as string;
            const answerType = item.answer_type as string;
            const claimedAnswer = item.claimed_answer;

            // GUARD: Extract numbers from question and expression; verify all expression numbers appear in question
            const questionNumbers = extractNumbersFromText(question);
            const exprNumbers = extractNumbersFromExpression(checkExpr);

            let allNumbersInQuestion = true;
            for (const num of exprNumbers) {
              if (!questionNumbers.has(num)) {
                console.log("[absorb-worksheet] GUARD: expression contains", num, "but not in question:", question.substring(0, 100));
                allNumbersInQuestion = false;
                break;
              }
            }

            if (!allNumbersInQuestion) {
              continue; // Drop this item
            }

            // Evaluate expression directly (no context needed)
            const computed = evaluate(checkExpr);

            let verified = false;
            if (answerType === "yesno") {
              verified = computed === claimedAnswer;
              if (verified) {
                item.answer = computed ? "Oui" : "Non";
                item.verified = true;
                verifiedMathItems.push(item);
              } else {
                console.log("[absorb-worksheet] yesno item failed verification:", checkExpr, "computed:", computed, "claimed:", claimedAnswer);
              }
            } else {
              // number type
              verified = Math.abs(computed as number - (claimedAnswer as number)) < 0.005;
              if (verified) {
                item.answer = computed;
                item.verified = true;
                verifiedMathItems.push(item);
              } else {
                console.log("[absorb-worksheet] number item failed verification:", checkExpr, "computed:", computed, "claimed:", claimedAnswer);
              }
            }
          } catch (evalError) {
            console.error("[absorb-worksheet] failed to evaluate", item.check_expression, "error:", evalError);
          }
        } else {
          otherItems.push(item);
        }
      }
    }

    // If fewer than 3 verified math items, request more
    if (verifiedMathItems.length < 3 && worksheet.concept?.sub_skills) {
      console.log("[absorb-worksheet] only", verifiedMathItems.length, "verified math items, requesting 4 more");
      const subSkillsStr = worksheet.concept.sub_skills.map((s: Record<string, unknown>) => s.label).join(", ");
      const language = worksheet.language as string;

      const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: [
              { type: "text", text: RETRY_PROMPT(subSkillsStr, language) },
              { type: "image_url", image_url: { url: image } },
            ] },
          ],
        }),
      });

      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryRaw = retryData.choices?.[0]?.message?.content ?? "";
        console.log("[absorb-worksheet] retry response:", retryRaw.substring(0, 300));

        let retryItems: Record<string, unknown>[] = [];
        try {
          retryItems = JSON.parse(retryRaw);
        } catch {
          // Try to extract JSON array
          const arrayMatch = retryRaw.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            try {
              retryItems = JSON.parse(arrayMatch[0]);
            } catch {
              console.log("[absorb-worksheet] failed to parse retry items");
            }
          }
        }

        // Verify retry items
        for (const item of retryItems) {
          if (item.kind === "math") {
            try {
              const question = item.question as string;
              const checkExpr = item.check_expression as string;
              const answerType = item.answer_type as string;
              const claimedAnswer = item.claimed_answer;

              // GUARD: Extract numbers from question and expression; verify all expression numbers appear in question
              const questionNumbers = extractNumbersFromText(question);
              const exprNumbers = extractNumbersFromExpression(checkExpr);

              let allNumbersInQuestion = true;
              for (const num of exprNumbers) {
                if (!questionNumbers.has(num)) {
                  console.log("[absorb-worksheet] GUARD (retry): expression contains", num, "but not in question");
                  allNumbersInQuestion = false;
                  break;
                }
              }

              if (!allNumbersInQuestion) {
                continue; // Drop this item
              }

              // Evaluate expression directly
              const computed = evaluate(checkExpr);

              if (answerType === "yesno") {
                if (computed === claimedAnswer) {
                  item.answer = computed ? "Oui" : "Non";
                  item.verified = true;
                  verifiedMathItems.push(item);
                }
              } else {
                // number type
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
        totalGenerated += retryItems.length;
      }
    }

    // Check coverage: which sub-skills have zero math items?
    const allSubSkills = (worksheet.concept?.sub_skills as Array<{label: string}>)?.map((s) => s.label) || [];
    let missingSubSkills = getMissingSubSkills(allSubSkills, verifiedMathItems);

    // Top-up for each missing sub-skill
    for (const missingSkill of missingSubSkills) {
      console.log("[absorb-worksheet] generating math top-up for missing sub-skill:", missingSkill);

      const topupRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: MATH_TOPUP_PROMPT(missingSkill, worksheet.language as string) },
          ],
        }),
      });

      if (!topupRes.ok) {
        console.error("[absorb-worksheet] math top-up generation failed:", topupRes.status);
        continue;
      }

      const topupData = await topupRes.json();
      const topupRaw = topupData.choices?.[0]?.message?.content ?? "";

      let topupCandidates: Record<string, unknown>[] = [];
      try {
        const cleaned = topupRaw.trim().replace(/^```[\s\S]*?\n/, "").replace(/```$/, "");
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          topupCandidates = JSON.parse(arrayMatch[0]);
        }
      } catch {
        console.log("[absorb-worksheet] failed to parse math top-up items");
        continue;
      }

      // Verify top-up items
      for (const item of topupCandidates) {
        if (item.kind === "math") {
          try {
            const question = item.question as string;
            const checkExpr = item.check_expression as string;
            const answerType = item.answer_type as string;
            const claimedAnswer = item.claimed_answer;

            // GUARD: numeric verification
            const questionNumbers = extractNumbersFromText(question);
            const exprNumbers = extractNumbersFromExpression(checkExpr);

            let allNumbersInQuestion = true;
            for (const num of exprNumbers) {
              if (!questionNumbers.has(num)) {
                console.log("[absorb-worksheet] GUARD (topup): expression contains", num, "but not in question");
                allNumbersInQuestion = false;
                break;
              }
            }

            if (!allNumbersInQuestion) {
              continue;
            }

            // Evaluate
            const computed = evaluate(checkExpr);

            let verified = false;
            if (answerType === "yesno") {
              verified = computed === claimedAnswer;
              if (verified) {
                item.answer = computed ? "Oui" : "Non";
                item.verified = true;
                verifiedMathItems.push(item);
              }
            } else {
              verified = Math.abs(computed as number - (claimedAnswer as number)) < 0.005;
              if (verified) {
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

      totalGenerated += topupCandidates.length;

      // Re-check coverage
      missingSubSkills = getMissingSubSkills(allSubSkills, verifiedMathItems);
      if (missingSubSkills.length === 0) break; // All covered
    }

    // Final selection: prefer diversity, cap at 4-5 items
    const { final: finalItems, uncovered } = selectFinalItems(verifiedMathItems, allSubSkills, 5);

    // Add other items if space
    for (const item of otherItems) {
      if (finalItems.length >= 5) break;
      finalItems.push(item);
    }

    // Clean up response: remove check_expression, claimed_answer, and context from returned math items
    const cleanedItems = finalItems.map((item: Record<string, unknown>) => {
      if (item.kind === "math") {
        const { check_expression, claimed_answer, context, ...rest } = item;
        return rest;
      }
      return item;
    });

    worksheet.practice = cleanedItems;
    worksheet.debug = {
      generated: totalGenerated,
      kept: cleanedItems.length,
      domain_raw: domainRaw,
      language_raw: languageRaw,
      path_taken: pathTaken,
      uncovered_subskills: uncovered.length > 0 ? uncovered : undefined,
    };

    console.log("[absorb-worksheet] final result: concept:", worksheet.concept?.label, "items:", cleanedItems.length, "path:", pathTaken, "uncovered:", uncovered, "debug:", worksheet.debug);
    return json(worksheet, 200);
  } catch (e) {
    console.error("[absorb-worksheet] unexpected error", e);
    return json({ error: String(e) }, 500);
  }
});

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  let cleanJson = raw.trim();
  if (cleanJson.startsWith("```")) {
    const endFence = cleanJson.lastIndexOf("```");
    if (endFence > 3) cleanJson = cleanJson.substring(cleanJson.indexOf("\n") + 1, endFence);
  }
  const jsonStart = cleanJson.indexOf("{");
  const jsonEnd = cleanJson.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
  }
  cleanJson = cleanJson.trim();
  console.log("[absorb-worksheet] cleaned JSON (first 300 chars):", cleanJson.substring(0, 300));

  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("[absorb-worksheet] JSON parse FAILED:", e);
    return null;
  }
}

// Extract numeric values from text, handling French comma decimals (5,20 → 5.20)
function extractNumbersFromText(text: string): Set<number> {
  const numbers = new Set<number>();
  // Match both comma and dot decimals: \d+[.,]\d+ or just \d+
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

// Extract numeric literals from an expression (e.g., "floor(15 / 2.50) + 3" → [15, 2.50, 3])
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

// Check if language is French (robust: français/francais/french or fr code)
function isFrench(language: string): boolean {
  const lower = (language ?? "").toLowerCase();
  return lower.includes("fran") || lower.startsWith("fr");
}

// Check if language is English (robust: anglais/english or en code)
function isEnglish(language: string): boolean {
  const lower = (language ?? "").toLowerCase();
  return lower.includes("angl") || lower.includes("engl") || lower.startsWith("en");
}

function cleanSpellingEntry(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^[\s\d.)\]-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpellingListWorksheet(worksheet: Record<string, unknown>): Record<string, unknown> | null {
  const sourceType = String(worksheet.source_type ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const conceptText = buildConceptScope(worksheet)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const rawWords = Array.isArray(worksheet.spelling_words) ? worksheet.spelling_words : [];
  const words = Array.from(new Set(rawWords.map(cleanSpellingEntry).filter((word) => word.length > 0)));

  const looksLikeSpellingList =
    sourceType === "spelling_list" ||
    words.length >= 3 ||
    (
      conceptText.includes("orthographe") ||
      conceptText.includes("spelling list") ||
      conceptText.includes("mots a apprendre") ||
      conceptText.includes("word list")
    );

  if (!looksLikeSpellingList || words.length < 3) return null;

  const language = String(worksheet.language ?? "");
  const french = isFrench(language);
  const conceptLabel = french ? "Liste d'orthographe" : "Spelling list";
  const description = french
    ? "S'entraîner à écrire correctement les mots de la liste."
    : "Practice spelling the words from the list correctly.";
  const prompt = french ? "Écris le mot dicté" : "Spell the dictated word";

  worksheet.domain = "language";
  worksheet.source_type = "spelling_list";
  worksheet.concept = {
    label: conceptLabel,
    description,
    sub_skills: [{ label: conceptLabel, description }],
  };
  worksheet.lesson = french
    ? "Lis chaque mot attentivement, écoute ses sons, puis écris-le en gardant les accents et les lettres dans le bon ordre."
    : "Read each word carefully, listen to its sounds, then write it with every letter in the correct order.";
  worksheet.spelling_words = words;
  worksheet.practice = words.slice(0, 6).map((word) => ({
    kind: "spelling",
    sub_skill: conceptLabel,
    question: `${prompt} : « ${word} »`,
    answer: word,
  }));
  worksheet.debug = {
    ...(worksheet.debug as Record<string, unknown> | undefined),
    path_taken: "spelling_list",
    spelling_word_count: words.length,
  };

  return worksheet;
}

// Normalize text for language answer comparison: NFC, lowercase, trim, collapse whitespace, replace curly quotes, strip articles, strip punctuation, keep accents
function normalizeAnswerText(text: string): string {
  let normalized = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/’/g, "’") // Replace curly apostrophe with straight
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading articles (French: le, la, les, l’, un, une, des; English: the, a, an)
  normalized = normalized.replace(/^(le|la|les|l’|un|une|des|the|a|an)\s+/i, "");

  // Strip trailing punctuation
  normalized = normalized.replace(/[.,!?;:]+$/, "");

  return normalized;
}

// Check which sub-skills have zero verified items
function getMissingSubSkills(allSubSkills: string[], verifiedItems: Record<string, unknown>[]): string[] {
  const coveredSubSkills = new Set(verifiedItems.map((item) => item.sub_skill as string));
  return allSubSkills.filter((skill) => !coveredSubSkills.has(skill));
}

// Select final items: prefer diversity (at least one per sub_skill), then fill remaining slots
function selectFinalItems(
  verifiedItems: Record<string, unknown>[],
  allSubSkills: string[],
  maxItems: number = 4
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

  // Second pass: fill remaining slots with best items
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

function buildConceptScope(worksheet: Record<string, unknown>): string {
  const concept = worksheet.concept as {
    label?: string;
    description?: string;
    sub_skills?: Array<{ label?: string; description?: string }>;
  } | undefined;

  const lines = [
    concept?.label ? `Concept: ${concept.label}` : "",
    concept?.description ? `Description: ${concept.description}` : "",
    ...(concept?.sub_skills || []).map((skill) =>
      `Sub-skill: ${skill.label || ""}${skill.description ? ` — ${skill.description}` : ""}`
    ),
  ].filter(Boolean);

  return lines.join("\n") || "Use only the specific grammar/language scope identified from the worksheet.";
}

function isLikelyConjugationPractice(worksheet: Record<string, unknown>): boolean {
  const scope = buildConceptScope(worksheet)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return (
    scope.includes("conjug") ||
    scope.includes("verbe") ||
    scope.includes("verb") ||
    scope.includes("futur") ||
    scope.includes("tense")
  );
}

function normalizeLanguageConceptLabel(
  worksheet: Record<string, unknown>,
  language: string,
  isConjugationPractice: boolean,
  subSkills: string[]
) {
  if (!isConjugationPractice) return;

  const french = isFrench(language);
  const concept = (worksheet.concept ?? {}) as {
    label?: string;
    description?: string;
    sub_skills?: Array<{ label?: string; description?: string }>;
  };
  const preferredLabel = subSkills[0] || (french ? "Conjugaison" : "Conjugation");
  const existingDescription = concept.description || "";
  const fallbackDescription = french
    ? "S'entraîner à conjuguer les verbes avec le bon pronom et le bon temps."
    : "Practice conjugating verbs with the correct pronoun and tense.";

  worksheet.concept = {
    ...concept,
    label: preferredLabel,
    description: existingDescription || fallbackDescription,
    sub_skills: subSkills.map((label) => ({
      label,
      description: concept.sub_skills?.find((skill) => skill.label === label)?.description || fallbackDescription,
    })),
  };
}

function getLanguageSubSkills(worksheet: Record<string, unknown>, isConjugationPractice: boolean): string[] {
  if (isConjugationPractice) {
    const scope = buildConceptScope(worksheet)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

    if (scope.includes("futur")) return ["Conjuguer au futur simple"];
    if (scope.includes("present")) return ["Conjuguer au présent"];
    if (scope.includes("imparfait")) return ["Conjuguer à l'imparfait"];
    if (scope.includes("passe compose")) return ["Conjuguer au passé composé"];
    return ["Conjuguer le verbe"];
  }

  return (worksheet.concept?.sub_skills as Array<{ label: string }>)?.map((s) => s.label) || ["grammar"];
}

function shouldRejectLanguageItem(item: Record<string, unknown>, isConjugationPractice: boolean): boolean {
  if (!isConjugationPractice) return false;

  const question = String(item.question || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const expected = normalizeAnswerText(String(item.expected_answer || ""))
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const pronounAnswers = new Set([
    "je",
    "j'",
    "tu",
    "il",
    "elle",
    "on",
    "nous",
    "vous",
    "ils",
    "elles",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
  ]);

  if (pronounAnswers.has(expected)) return true;

  const asksForMetaGrammar =
    /(radical|terminaison|ending|stem|infinitif|infinitive|temps|tense|categorie|category)/.test(question) ||
    /(1ere|1re|2e|3e|premiere|deuxieme|troisieme|personne|singulier|pluriel)/.test(question);

  if (asksForMetaGrammar) return true;

  const asksForPronoun =
    /(quel|quelle|identify|which|choisis|choose|trouve|find).{0,60}(pronom|subject pronoun)/.test(question) ||
    /(pronom|subject pronoun).{0,60}(sujet|subject)/.test(question);

  const asksToConjugate = /(conjug|mets|mettez|ecris|write|complete|complet)/.test(question);

  return asksForPronoun && !asksToConjugate;
}

// Handle language/grammar practice: generate, verify by re-solving, filter
async function handleLanguagePractice(worksheet: Record<string, unknown>, language: string, domainRaw: string): Promise<Response> {
  const isConjugationPractice = isLikelyConjugationPractice(worksheet);
  const allSubSkills = getLanguageSubSkills(worksheet, isConjugationPractice);
  normalizeLanguageConceptLabel(worksheet, language, isConjugationPractice, allSubSkills);
  const conceptScope = buildConceptScope(worksheet);
  const subSkillsList = allSubSkills.join(", ");

  // Generate 8 candidate language items
  const genRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "user", content: LANGUAGE_PROMPT(subSkillsList, language, conceptScope) },
      ],
    }),
  });

  if (!genRes.ok) {
    console.error("[absorb-worksheet] Language generation error:", genRes.status);
    worksheet.practice = [];
    worksheet.debug = {
      generated: 0,
      kept: 0,
      domain_raw: domainRaw,
      language_raw: language,
      path_taken: "reference",
      reference_candidates: [],
    };
    return json(worksheet, 200);
  }

  const genData = await genRes.json();
  const genRaw = genData.choices?.[0]?.message?.content ?? "";
  console.log("[absorb-worksheet] language gen response:", genRaw.substring(0, 300));

  let candidateItems: Record<string, unknown>[] = [];
  try {
    const cleaned = genRaw.trim().replace(/^```[\s\S]*?\n/, "").replace(/```$/, "");
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      candidateItems = JSON.parse(arrayMatch[0]);
    }
  } catch (e) {
    console.error("[absorb-worksheet] failed to parse language items:", e);
    worksheet.practice = [];
    worksheet.debug = {
      generated: 0,
      kept: 0,
      domain_raw: domainRaw,
      language_raw: language,
      path_taken: "reference",
      reference_candidates: [],
    };
    return json(worksheet, 200);
  }

  // Extract questions for verification
  const questions = candidateItems.map((item) => item.question as string);

  // Verify by re-solving: ask model to answer the questions
  const verifyRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "user", content: LANGUAGE_VERIFY_PROMPT(language, questions) },
      ],
    }),
  });

  if (!verifyRes.ok) {
    console.error("[absorb-worksheet] Verification error:", verifyRes.status);
    worksheet.practice = [];
    worksheet.debug = { generated: 0, kept: 0 };
    return json(worksheet, 200);
  }

  const verifyData = await verifyRes.json();
  const verifyRaw = verifyData.choices?.[0]?.message?.content ?? "";
  console.log("[absorb-worksheet] verification response:", verifyRaw.substring(0, 300));

  // Parse verification answers as JSON
  let solverAnswers: Record<string, unknown> = {};
  try {
    const jsonMatch = verifyRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      solverAnswers = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[absorb-worksheet] failed to parse solver JSON:", e);
    worksheet.practice = [];
    worksheet.debug = {
      generated: candidateItems.length,
      kept: 0,
      domain_raw: domainRaw,
      language_raw: language,
      path_taken: "reference",
      reference_candidates: [],
    };
    return json(worksheet, 200);
  }

  const solverAnswerArray = (solverAnswers.answers as Array<{i: number; answer: string}>) || [];
  // Match verified items: compare normalized answers
  let verifiedItems: Record<string, unknown>[] = [];
  const referenceCandidates: Record<string, unknown>[] = [];
  let totalGenerated = candidateItems.length;

  for (let i = 0; i < candidateItems.length; i++) {
    const item = candidateItems[i];
    const solverAnswer = solverAnswerArray.find((a) => a.i === i + 1)?.answer || "";

    const expectedNorm = normalizeAnswerText(item.expected_answer as string);
    const solverNorm = normalizeAnswerText(solverAnswer);
    const matched = expectedNorm === solverNorm;

    // Add to debug list
    referenceCandidates.push({
      question: item.question,
      expected_answer: item.expected_answer,
      solver_answer: solverAnswer,
      matched,
    });

    if (matched && !shouldRejectLanguageItem(item, isConjugationPractice)) {
      item.verified = true;
      item.answer = item.expected_answer;
      verifiedItems.push(item);
    } else {
      console.log("[absorb-worksheet] language item mismatch:", "expected:", expectedNorm, "solver:", solverNorm);
    }
  }

  // Check coverage: which sub-skills have zero items?
  let missingSubSkills = getMissingSubSkills(allSubSkills, verifiedItems);

  // Top-up for each missing sub-skill
  for (const missingSkill of missingSubSkills) {
    console.log("[absorb-worksheet] generating top-up for missing sub-skill:", missingSkill);

    const topupRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: LANGUAGE_TOPUP_PROMPT(missingSkill, language, conceptScope) },
        ],
      }),
    });

    if (!topupRes.ok) {
      console.error("[absorb-worksheet] top-up generation failed:", topupRes.status);
      continue;
    }

    const topupData = await topupRes.json();
    const topupRaw = topupData.choices?.[0]?.message?.content ?? "";

    let topupCandidates: Record<string, unknown>[] = [];
    try {
      const cleaned = topupRaw.trim().replace(/^```[\s\S]*?\n/, "").replace(/```$/, "");
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        topupCandidates = JSON.parse(arrayMatch[0]);
      }
    } catch {
      console.log("[absorb-worksheet] failed to parse top-up items");
      continue;
    }

    // Verify top-up items
    const topupVerifyRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "user", content: LANGUAGE_VERIFY_PROMPT(language, topupCandidates.map((c) => c.question as string)) },
        ],
      }),
    });

    if (topupVerifyRes.ok) {
      const topupVerifyData = await topupVerifyRes.json();
      const topupVerifyRaw = topupVerifyData.choices?.[0]?.message?.content ?? "";

      let topupSolverAnswers: Record<string, unknown> = {};
      try {
        const jsonMatch = topupVerifyRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          topupSolverAnswers = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.log("[absorb-worksheet] failed to parse top-up solver response");
        continue;
      }

      const topupSolverAnswerArray = (topupSolverAnswers.answers as Array<{i: number; answer: string}>) || [];

      for (let i = 0; i < topupCandidates.length; i++) {
        const item = topupCandidates[i];
        const solverAnswer = topupSolverAnswerArray.find((a) => a.i === i + 1)?.answer || "";

        const expectedNorm = normalizeAnswerText(item.expected_answer as string);
        const solverNorm = normalizeAnswerText(solverAnswer);

        if (expectedNorm === solverNorm && !shouldRejectLanguageItem(item, isConjugationPractice)) {
          item.verified = true;
          item.answer = item.expected_answer;
          verifiedItems.push(item);
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

    // Re-check coverage
    missingSubSkills = getMissingSubSkills(allSubSkills, verifiedItems);
    if (missingSubSkills.length === 0) break; // All covered
  }

  // Final selection: prefer diversity, cap at 4-5 items
  const { final: finalItems, uncovered } = selectFinalItems(verifiedItems, allSubSkills, 5);

  // Clean up: remove expected_answer
  const cleanedItems = finalItems.map((item) => {
    const { expected_answer, ...rest } = item;
    return rest;
  });

  worksheet.practice = cleanedItems;
  worksheet.debug = {
    generated: totalGenerated,
    kept: cleanedItems.length,
    domain_raw: domainRaw,
    language_raw: language,
    path_taken: "reference",
    reference_candidates: referenceCandidates,
    uncovered_subskills: uncovered.length > 0 ? uncovered : undefined,
  };
  return json(worksheet, 200);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
