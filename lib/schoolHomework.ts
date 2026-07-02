import { supabase } from "./supabase";
import { createMathAssignment, createSpellingAssignment, deleteAssignment } from "./assignments";
import {
  createSpellingItems,
  createSpellingList,
  extractWordsFromImage,
  listSpellingListsForChild,
  parseManualWords,
  SpellingLanguage,
  SpellingList,
} from "./spelling";

export type SchoolHomeworkKind = "generic" | "reading" | "worksheet" | "spelling" | "multiplication" | "division" | "signature";
export type SchoolHomeworkStatus = "pending" | "done" | "waiting_parent";

export type SchoolHomeworkItem = {
  id: string;
  homework_day_id: string;
  parent_id: string;
  child_id: string;
  task_text: string;
  task_kind: SchoolHomeworkKind;
  status: SchoolHomeworkStatus;
  sort_order: number;
  metadata: Record<string, unknown>;
  linked_assignment_id: string | null;
  linked_spelling_list_id: string | null;
  completed_at: string | null;
  completed_by: "child" | "adult" | "helper" | null;
  helper_name?: string | null;
  school_homework_materials?: SchoolHomeworkMaterial[];
};

export type SchoolHomeworkMaterial = {
  id: string;
  homework_item_id: string;
  homework_day_id: string;
  parent_id: string;
  child_id: string;
  material_type: "image" | "text" | "document";
  title: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  text_content: string | null;
  category?: "agenda" | "worksheet" | "quiz";
  created_at: string;
};

export type SchoolHomeworkDay = {
  id: string;
  parent_id: string;
  child_id: string;
  homework_date: string;
  source_type: "manual" | "photo" | "child";
  raw_input: string | null;
  status: "active" | "complete" | "archived";
  total_active_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  school_homework_items?: SchoolHomeworkItem[];
};

export type ExistingWorksheetImage = {
  id: string;
  bucket: string;
  path: string;
  title?: string | null;
  createdAt: string;
  signedUrl: string | null;
};

export type ParsedSchoolHomeworkItem = {
  task_text: string;
  task_kind: SchoolHomeworkKind;
  metadata: Record<string, unknown>;
  linked_assignment_id?: string | null;
  linked_spelling_list_id?: string | null;
};

export type ExtractedSchoolHomework = {
  rawText: string;
  items: string[];
  language: "English" | "French";
};

export function todayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

export function schoolHomeworkWeekDateKeys(anchor = new Date()): string[] {
  const date = new Date(anchor);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date);
    current.setDate(date.getDate() + index);
    return todayDateKey(current);
  });
}

export function schoolHomeworkDateLabel(dateKey: string, locale: "en" | "fr" = "en"): string {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function schoolHomeworkShortDateLabel(dateKey: string, locale: "en" | "fr" = "en"): string {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function cleanLine(line: string): string {
  return line
    .replace(/^\s*[-*•]\s*/u, "")
    .replace(/^\s*\d+[.)]\s*/u, "")
    .trim();
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findSpellingListReference(taskText: string, spellingLists: SpellingList[]): {
  listNumber: string | null;
  list: SpellingList | null;
} {
  const normalizedTask = normalizeText(taskText);
  const match = normalizedTask.match(/\b(?:liste|list)\s*(\d+)\b/);
  const listNumber = match?.[1] || null;
  if (!listNumber) return { listNumber: null, list: null };

  const list = spellingLists.find((candidate) => {
    const title = normalizeText(candidate.title);
    return title.includes(`liste ${listNumber}`) ||
      title.includes(`list ${listNumber}`) ||
      new RegExp(`\\b${listNumber}\\b`).test(title);
  }) || null;

  return { listNumber, list };
}

function mathTables(taskText: string): number[] {
  const normalized = normalizeText(taskText).replace(/×/g, "x");
  const range = normalized.match(/\b(\d{1,2})\s*x?\s*(?:a|à|-|to)\s*(\d{1,2})\s*x?\b/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const min = Math.max(0, Math.min(start, end));
      const max = Math.min(12, Math.max(start, end));
      return Array.from({ length: max - min + 1 }, (_, index) => min + index);
    }
  }

  const tables = new Set<number>();
  const tableContext = /\b(table|tables|multiplication|multiplier|division|diviser)\b/.test(normalized);
  const xPattern = /(?:\bx\s*(\d{1,2})\b|\b(\d{1,2})\s*x\b)/g;
  for (const match of normalized.matchAll(xPattern)) {
    const table = Number(match[1] || match[2]);
    if (Number.isInteger(table) && table >= 0 && table <= 12) tables.add(table);
  }

  if (tableContext) {
    const afterKeywordPattern = /\b(?:table|tables|multiplication|multiplier|division|diviser)(?:\s+par|\s+de)?\s+(\d{1,2})\b/g;
    for (const match of normalized.matchAll(afterKeywordPattern)) {
      const table = Number(match[1]);
      if (Number.isInteger(table) && table >= 0 && table <= 12) tables.add(table);
    }
  }

  return Array.from(tables);
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function looksLikeSignatureTask(normalized: string): boolean {
  if (/(faire signer|signer|signature|sign quiz|parent signature)/.test(normalized)) return true;

  const words = normalized.split(/\W+/).filter(Boolean);
  const hasSchoolProofTarget = /\b(quiz|interro|controle|test|evaluation|mot|cahier)\b/.test(normalized);
  const hasFaireTypo = words.some((word) => levenshteinDistance(word, "faire") <= 1 || word === "fer");
  const hasSignerTypo = words.some((word) =>
    word === "signe" ||
    word === "signer" ||
    word === "sugner" ||
    levenshteinDistance(word, "signer") <= 2
  );

  return hasSchoolProofTarget && hasFaireTypo && hasSignerTypo;
}

export function parseSchoolHomeworkInput(rawInput: string, spellingLists: SpellingList[] = []): ParsedSchoolHomeworkItem[] {
  return rawInput
    .split(/\r?\n/g)
    .map(cleanLine)
    .filter(Boolean)
    .map((taskText) => {
      const normalized = normalizeText(taskText);
      const spellingRef = findSpellingListReference(taskText, spellingLists);
      const tables = mathTables(taskText);

      if (looksLikeSignatureTask(normalized)) {
        return {
          task_text: taskText,
          task_kind: "signature" as const,
          metadata: { requires_parent_signature: true, needs_material: false },
        };
      }

      if (spellingRef.listNumber) {
        return {
          task_text: taskText,
          task_kind: "spelling" as const,
          linked_spelling_list_id: spellingRef.list?.id || null,
          metadata: {
            list_number: spellingRef.listNumber,
            matched_list_title: spellingRef.list?.title || null,
            needs_material: !spellingRef.list,
          },
        };
      }

      if (normalized.includes("division") || normalized.includes("diviser")) {
        return {
          task_text: taskText,
          task_kind: "division" as const,
          metadata: {
            tables,
            needs_generated_practice: tables.length > 0,
          },
        };
      }

      if (
        tables.length > 0 ||
        normalized.includes("multiplication") ||
        /\btable(s)?\b/.test(normalized)
      ) {
        return {
          task_text: taskText,
          task_kind: "multiplication" as const,
          metadata: {
            tables,
            needs_generated_practice: tables.length > 0,
          },
        };
      }

      if (/(relire|lire|lecture|read)\b/.test(normalized) || /\br\s*\d+/i.test(taskText)) {
        const reference = taskText.match(/\bR\s*\d+(?:\s*(?:a|à|-|to)\s*R?\s*\d+)?/i)?.[0] || null;
        return {
          task_text: taskText,
          task_kind: "reading" as const,
          metadata: {
            reference,
            needs_material: true,
          },
        };
      }

      if (/(fiche|worksheet|workbook|cahier|exercice|exercices|page|pages)\b/.test(normalized)) {
        return {
          task_text: taskText,
          task_kind: "worksheet" as const,
          metadata: {
            needs_material: true,
          },
        };
      }

      return {
        task_text: taskText,
        task_kind: "generic" as const,
        metadata: {},
      };
    });
}

export async function extractSchoolHomeworkFromImage(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<ExtractedSchoolHomework> {
  const { data, error } = await supabase.functions.invoke("extract-school-homework", {
    body: { imageBase64, mimeType },
  });

  if (error) throw error;
  if (!data || !Array.isArray(data.items)) throw new Error("Invalid homework extraction response");

  const items = data.items
    .map((item: unknown) => String(item || "").trim())
    .filter(Boolean);

  return {
    rawText: String(data.rawText || items.join("\n")).trim(),
    items,
    language: data.language === "English" ? "English" : "French",
  };
}

export async function replaceSchoolHomeworkDay(params: {
  childId: string;
  homeworkDate: string;
  rawInput: string;
  sourceType?: "manual" | "photo" | "child";
}): Promise<SchoolHomeworkDay> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error("Not authenticated");

  const parentId = authData.user.id;
  const spellingLists = await listSpellingListsForChild(params.childId);
  const parsedItems = parseSchoolHomeworkInput(params.rawInput, spellingLists);

  const { data: day, error: dayError } = await supabase
    .from("school_homework_days")
    .upsert({
      parent_id: parentId,
      child_id: params.childId,
      homework_date: params.homeworkDate,
      source_type: params.sourceType || "manual",
      raw_input: params.rawInput,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,homework_date" })
    .select()
    .single();

  if (dayError) throw dayError;

  const existingItems = ((await supabase
    .from("school_homework_items")
    .select("*, school_homework_materials(*)")
    .eq("homework_day_id", day.id)).data || []) as SchoolHomeworkItem[];

  const usedExistingIds = new Set<string>();

  const findReusableItem = (item: ParsedSchoolHomeworkItem): SchoolHomeworkItem | null => {
    const itemKey = normalizeText(item.task_text);
    const sameText = existingItems.find((existing) =>
      !usedExistingIds.has(existing.id) && normalizeText(existing.task_text) === itemKey
    );
    if (sameText) return sameText;

    return existingItems.find((existing) =>
      !usedExistingIds.has(existing.id) &&
      existing.task_kind === item.task_kind &&
      normalizeText(existing.task_text).includes(itemKey)
    ) || null;
  };

  if (parsedItems.length > 0) {
    const linkedItems = await Promise.all(
      parsedItems.map(async (item) => {
        const reusableItem = findReusableItem(item);
        if (reusableItem) usedExistingIds.add(reusableItem.id);

        const tables = Array.isArray(item.metadata.tables)
          ? (item.metadata.tables as unknown[]).filter((table): table is number => typeof table === "number")
          : [];

        const reusableTables = Array.isArray((reusableItem?.metadata as any)?.tables)
          ? ((reusableItem?.metadata as any).tables as unknown[]).filter((table): table is number => typeof table === "number")
          : [];
        const canReuseAssignment = reusableItem?.linked_assignment_id &&
          (item.task_kind === "multiplication" || item.task_kind === "division") &&
          tables.length > 0 &&
          JSON.stringify(tables) === JSON.stringify(reusableTables);

        if (canReuseAssignment) {
          return {
            ...item,
            id: reusableItem.id,
            status: reusableItem.status,
            completed_at: reusableItem.completed_at,
            completed_by: reusableItem.completed_by,
            linked_assignment_id: reusableItem.linked_assignment_id,
            linked_spelling_list_id: reusableItem.linked_spelling_list_id,
            metadata: {
              ...item.metadata,
              linked_practice: item.task_kind,
            },
          };
        }

        if ((item.task_kind === "multiplication" || item.task_kind === "division") && tables.length > 0) {
          try {
            const assignment = await createMathAssignment({
              childId: params.childId,
              topic: item.task_kind,
              count: 20,
              dueDate: params.homeworkDate,
              mode: "practice",
              operationTables: tables,
            });
            if (reusableItem?.linked_assignment_id && reusableItem.linked_assignment_id !== assignment.id) {
              void deleteAssignment(reusableItem.linked_assignment_id).catch((err) => {
                console.error("[school-homework] replaced linked assignment delete error:", err);
              });
            }
            return {
              ...item,
              ...(reusableItem
                ? {
                    id: reusableItem.id,
                    status: reusableItem.status,
                    completed_at: reusableItem.completed_at,
                    completed_by: reusableItem.completed_by,
                  }
                : {}),
              linked_assignment_id: assignment.id,
              metadata: {
                ...item.metadata,
                linked_practice: item.task_kind,
              },
            };
          } catch (err) {
            console.error("[school-homework] math assignment create error:", err);
          }
        }

        const hasMaterial = (reusableItem?.school_homework_materials || []).length > 0;
        return reusableItem
          ? {
              ...item,
              id: reusableItem.id,
              status: reusableItem.status,
              completed_at: reusableItem.completed_at,
              completed_by: reusableItem.completed_by,
              linked_assignment_id: item.linked_assignment_id || reusableItem.linked_assignment_id,
              linked_spelling_list_id: item.linked_spelling_list_id || reusableItem.linked_spelling_list_id,
              metadata: {
                ...item.metadata,
                needs_material: (item.metadata as any).needs_material ? !hasMaterial : (item.metadata as any).needs_material,
              },
            }
          : item;
      })
    );

    const updates = linkedItems.filter((item) => "id" in item && item.id);
    await Promise.all(updates.map(async (item: any) => {
      const sortOrder = linkedItems.findIndex((candidate) => candidate === item);
      const { error: updateError } = await supabase
        .from("school_homework_items")
        .update({
          task_text: item.task_text,
          task_kind: item.task_kind,
          sort_order: sortOrder === -1 ? 0 : sortOrder,
          metadata: item.metadata,
          linked_assignment_id: item.linked_assignment_id || null,
          linked_spelling_list_id: item.linked_spelling_list_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (updateError) throw updateError;
    }));

    const inserts = linkedItems.filter((item) => !("id" in item));
    const { error: itemError } = inserts.length > 0 ? await supabase.from("school_homework_items").insert(
      inserts.map((item, insertIndex) => {
        const sortOrder = linkedItems.findIndex((candidate) => candidate === item);
        return {
        homework_day_id: day.id,
        parent_id: parentId,
        child_id: params.childId,
        task_text: item.task_text,
        task_kind: item.task_kind,
        status: item.task_kind === "signature" ? "waiting_parent" : "pending",
        sort_order: sortOrder === -1 ? insertIndex : sortOrder,
        metadata: item.metadata,
        linked_assignment_id: item.linked_assignment_id || null,
        linked_spelling_list_id: item.linked_spelling_list_id || null,
        };
      })
    ) : { error: null };

    if (itemError) throw itemError;
  }

  const removedItems = existingItems.filter((item) => !usedExistingIds.has(item.id));
  const removedAssignmentIds = removedItems.map((item) => item.linked_assignment_id).filter(Boolean) as string[];
  await Promise.all(
    Array.from(new Set(removedAssignmentIds)).map((assignmentId) =>
      deleteAssignment(assignmentId).catch((err) => {
        console.error("[school-homework] removed linked assignment delete error:", err);
      })
    )
  );

  if (removedItems.length > 0) {
    const { error: deleteError } = await supabase
      .from("school_homework_items")
      .delete()
      .in("id", removedItems.map((item) => item.id));

    if (deleteError) throw deleteError;
  }

  return listSchoolHomeworkDay(params.childId, params.homeworkDate) as Promise<SchoolHomeworkDay>;
}

export async function listSchoolHomeworkDay(childId: string, homeworkDate = todayDateKey()): Promise<SchoolHomeworkDay | null> {
  const { data, error } = await supabase
    .from("school_homework_days")
    .select("*, school_homework_items(*, school_homework_materials(*))")
    .eq("child_id", childId)
    .eq("homework_date", homeworkDate)
    .neq("status", "archived")
    .maybeSingle();

  if (error) {
    console.error("[school-homework] list day error:", error);
    return null;
  }

  if (!data) return null;
  const items = (((data as any).school_homework_items || []) as SchoolHomeworkItem[]).map((item) => ({
    ...item,
    school_homework_materials: (item.school_homework_materials || []).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));
  return {
    ...(data as SchoolHomeworkDay),
    school_homework_items: items.sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function listSchoolHomeworkWeek(childId: string, dateKeys = schoolHomeworkWeekDateKeys()): Promise<(SchoolHomeworkDay | null)[]> {
  return Promise.all(dateKeys.map((dateKey) => listSchoolHomeworkDay(childId, dateKey)));
}

export async function setSchoolHomeworkItemDone(
  item: Pick<SchoolHomeworkItem, "id" | "status">,
  done: boolean,
  completedBy: "child" | "adult" | "helper" = "child",
  helperName?: string | null
): Promise<void> {
  const nextStatus: SchoolHomeworkStatus = done
    ? "done"
    : item.status === "waiting_parent"
      ? "waiting_parent"
      : "pending";

  const { error } = await supabase
    .from("school_homework_items")
    .update({
      status: nextStatus,
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? completedBy : null,
      helper_name: done && helperName ? helperName.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) throw error;
}

export async function getChildHomeworkEntryEnabled(childId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("children")
    .select("allow_child_homework_entry")
    .eq("id", childId)
    .maybeSingle();

  if (error) {
    console.error("[school-homework] child entry setting read error:", error);
    return false;
  }

  return Boolean((data as any)?.allow_child_homework_entry);
}

export async function setChildHomeworkEntryEnabled(childId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("children")
    .update({ allow_child_homework_entry: enabled })
    .eq("id", childId);

  if (error) throw error;
}

export async function linkSchoolHomeworkAssignment(params: {
  itemId: string;
  assignmentId: string;
  practiceType: string;
}): Promise<void> {
  const { data: item, error: readError } = await supabase
    .from("school_homework_items")
    .select("metadata")
    .eq("id", params.itemId)
    .single();

  if (readError) throw readError;

  const { error } = await supabase
    .from("school_homework_items")
    .update({
      linked_assignment_id: params.assignmentId,
      metadata: {
        ...((item as any)?.metadata || {}),
        linked_practice: params.practiceType,
        needs_material: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.itemId);

  if (error) throw error;
}

export function itemNeedsMaterial(item: Pick<SchoolHomeworkItem, "task_kind" | "metadata" | "school_homework_materials">): boolean {
  const hasMaterial = (item.school_homework_materials || []).length > 0;
  return Boolean((item.metadata as any)?.needs_material) && !hasMaterial;
}

export function schoolHomeworkMaterialTitle(item: Pick<SchoolHomeworkItem, "task_text" | "task_kind" | "metadata">): string {
  const metadata = (item.metadata || {}) as Record<string, unknown>;
  if (item.task_kind === "reading") {
    return metadata.reference ? `Reading: ${metadata.reference}` : `Reading: ${item.task_text}`;
  }
  if (item.task_kind === "spelling") {
    return metadata.list_number ? `Spelling: Liste ${metadata.list_number}` : `Spelling: ${item.task_text}`;
  }
  if (item.task_kind === "worksheet") {
    return `Worksheet: ${item.task_text}`;
  }
  if (item.task_kind === "signature") {
    return `Signature: ${item.task_text}`;
  }
  return item.task_text;
}

export async function addSchoolHomeworkTextMaterial(params: {
  item: SchoolHomeworkItem;
  title?: string;
  textContent: string;
  category?: SchoolHomeworkMaterial["category"];
}): Promise<void> {
  const content = params.textContent.trim();
  if (!content) throw new Error("Material text is empty");
  await clearSchoolHomeworkMaterials(params.item.id);

  const { error: insertError } = await supabase
    .from("school_homework_materials")
    .insert({
      homework_item_id: params.item.id,
      homework_day_id: params.item.homework_day_id,
      parent_id: params.item.parent_id,
      child_id: params.item.child_id,
      material_type: "text",
      title: params.title || schoolHomeworkMaterialTitle(params.item),
      text_content: content,
      category: params.category || "worksheet",
    });

  if (insertError) throw insertError;
  if (params.item.task_kind === "spelling" && !params.item.linked_spelling_list_id) {
    await createSpellingPracticeFromMaterial(params.item, content);
  }
  await markItemMaterialReady(params.item.id);
}

async function createSpellingPracticeFromMaterial(item: SchoolHomeworkItem, rawWords: string): Promise<void> {
  const words = parseManualWords(rawWords);
  if (words.length === 0) return;
  await createLinkedSpellingPractice(item, words, "French");
}

async function createSpellingPracticeFromImageMaterial(item: SchoolHomeworkItem, imageBase64: string): Promise<void> {
  const { words, language } = await extractWordsFromImage(imageBase64, "image/jpeg");
  if (words.length === 0) return;
  await createLinkedSpellingPractice(item, words, language);
}

async function createLinkedSpellingPractice(item: SchoolHomeworkItem, words: string[], language: SpellingLanguage): Promise<void> {
  const listNumber = (item.metadata as any)?.list_number;
  const title = listNumber ? `Liste ${listNumber}` : item.task_text;
  const list = await createSpellingList(item.child_id, title, language, "manual");
  await createSpellingItems(list.id, item.child_id, words, language);
  const assignment = await createSpellingAssignment(item.child_id, list.id, title, words.length, "practice");

  const { error } = await supabase
    .from("school_homework_items")
    .update({
      linked_spelling_list_id: list.id,
      linked_assignment_id: assignment.id,
      metadata: {
        ...item.metadata,
        needs_material: false,
        matched_list_title: title,
        created_spelling_list: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) throw error;
}

export async function addSchoolHomeworkImageMaterial(params: {
  item: SchoolHomeworkItem;
  storagePath?: string;
  dataUrl?: string;
  imageBase64?: string;
  title?: string;
  bucket?: string;
  category?: SchoolHomeworkMaterial["category"];
}): Promise<{ createdSpellingPractice: boolean }> {
  if (!params.storagePath && !params.dataUrl) throw new Error("Image material is missing");
  await clearSchoolHomeworkMaterials(params.item.id);

  const { error: insertError } = await supabase
    .from("school_homework_materials")
    .insert({
      homework_item_id: params.item.id,
      homework_day_id: params.item.homework_day_id,
      parent_id: params.item.parent_id,
      child_id: params.item.child_id,
      material_type: "image",
      title: params.title || schoolHomeworkMaterialTitle(params.item),
      storage_bucket: params.storagePath ? params.bucket || "worksheets" : null,
      storage_path: params.storagePath || null,
      text_content: params.dataUrl || null,
      category: params.category || "worksheet",
    });

  if (insertError) throw insertError;
  let createdSpellingPractice = false;
  if (params.item.task_kind === "spelling" && !params.item.linked_spelling_list_id && params.imageBase64) {
    await createSpellingPracticeFromImageMaterial(params.item, params.imageBase64);
    createdSpellingPractice = true;
  }
  await markItemMaterialReady(params.item.id);
  return { createdSpellingPractice };
}

export async function addSchoolHomeworkDocumentMaterial(params: {
  item: SchoolHomeworkItem;
  storagePath: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  bucket?: string;
  category?: SchoolHomeworkMaterial["category"];
}): Promise<void> {
  if (!params.storagePath) throw new Error("Document material is missing");
  await clearSchoolHomeworkMaterials(params.item.id);

  const { error: insertError } = await supabase
    .from("school_homework_materials")
    .insert({
      homework_item_id: params.item.id,
      homework_day_id: params.item.homework_day_id,
      parent_id: params.item.parent_id,
      child_id: params.item.child_id,
      material_type: "document",
      title: params.title || params.fileName || schoolHomeworkMaterialTitle(params.item),
      storage_bucket: params.bucket || "worksheets",
      storage_path: params.storagePath,
      text_content: params.mimeType || null,
      category: params.category || "worksheet",
    });

  if (insertError) throw insertError;
  await markItemMaterialReady(params.item.id);
}

async function clearSchoolHomeworkMaterials(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("school_homework_materials")
    .delete()
    .eq("homework_item_id", itemId);

  if (error) throw error;
}

async function markItemMaterialReady(itemId: string): Promise<void> {
  const { data: item, error: readError } = await supabase
    .from("school_homework_items")
    .select("metadata")
    .eq("id", itemId)
    .single();

  if (readError) throw readError;
  const metadata = { ...((item as any)?.metadata || {}), needs_material: false };
  const { error: updateError } = await supabase
    .from("school_homework_items")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (updateError) throw updateError;
}

export async function createSchoolHomeworkAssignmentItem(params: {
  childId: string;
  homeworkDate: string;
  assignmentId: string;
  taskText: string;
  taskKind?: SchoolHomeworkKind;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error("Not authenticated");

  const parentId = authData.user.id;
  const { data: existing } = await supabase
    .from("school_homework_items")
    .select("id")
    .eq("linked_assignment_id", params.assignmentId)
    .maybeSingle();

  if (existing?.id) return;

  const { data: existingDay } = await supabase
    .from("school_homework_days")
    .select("*")
    .eq("child_id", params.childId)
    .eq("homework_date", params.homeworkDate)
    .neq("status", "archived")
    .maybeSingle();

  const rawInput = [((existingDay as any)?.raw_input || "").trim(), params.taskText]
    .filter(Boolean)
    .join("\n");
  const { data: day, error: dayError } = await supabase
    .from("school_homework_days")
    .upsert({
      parent_id: parentId,
      child_id: params.childId,
      homework_date: params.homeworkDate,
      source_type: (existingDay as any)?.source_type || "manual",
      raw_input: rawInput,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,homework_date" })
    .select()
    .single();

  if (dayError) throw dayError;

  const { count } = await supabase
    .from("school_homework_items")
    .select("id", { count: "exact", head: true })
    .eq("homework_day_id", day.id);

  const { error: itemError } = await supabase.from("school_homework_items").insert({
    homework_day_id: day.id,
    parent_id: parentId,
    child_id: params.childId,
    task_text: params.taskText,
    task_kind: params.taskKind || "generic",
    status: "pending",
    sort_order: count || 0,
    metadata: params.metadata || {},
    linked_assignment_id: params.assignmentId,
    linked_spelling_list_id: null,
  });

  if (itemError) throw itemError;
}

export async function createSchoolHomeworkWorksheetItem(params: {
  childId: string;
  homeworkDate: string;
  episodeId: string;
  taskText: string;
  imagePath: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error("Not authenticated");

  const parentId = authData.user.id;
  const { data: existing } = await supabase
    .from("school_homework_items")
    .select("id")
    .eq("child_id", params.childId)
    .contains("metadata", { linked_episode_id: params.episodeId })
    .maybeSingle();

  if (existing?.id) return;

  const { data: existingDay } = await supabase
    .from("school_homework_days")
    .select("*")
    .eq("child_id", params.childId)
    .eq("homework_date", params.homeworkDate)
    .neq("status", "archived")
    .maybeSingle();

  const rawInput = [((existingDay as any)?.raw_input || "").trim(), params.taskText]
    .filter(Boolean)
    .join("\n");
  const { data: day, error: dayError } = await supabase
    .from("school_homework_days")
    .upsert({
      parent_id: parentId,
      child_id: params.childId,
      homework_date: params.homeworkDate,
      source_type: (existingDay as any)?.source_type || "manual",
      raw_input: rawInput,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,homework_date" })
    .select()
    .single();

  if (dayError) throw dayError;

  const { count } = await supabase
    .from("school_homework_items")
    .select("id", { count: "exact", head: true })
    .eq("homework_day_id", day.id);

  const metadata = {
    ...(params.metadata || {}),
    linked_episode_id: params.episodeId,
    linked_practice: "worksheet",
    needs_material: false,
  };

  const { data: item, error: itemError } = await supabase
    .from("school_homework_items")
    .insert({
      homework_day_id: day.id,
      parent_id: parentId,
      child_id: params.childId,
      task_text: params.taskText,
      task_kind: "worksheet",
      status: "pending",
      sort_order: count || 0,
      metadata,
      linked_assignment_id: null,
      linked_spelling_list_id: null,
    })
    .select("*")
    .single();

  if (itemError) throw itemError;

  const { error: materialError } = await supabase
    .from("school_homework_materials")
    .insert({
      homework_item_id: item.id,
      homework_day_id: day.id,
      parent_id: parentId,
      child_id: params.childId,
      material_type: "image",
      title: params.title || `Worksheet: ${params.taskText}`,
      storage_bucket: "worksheets",
      storage_path: params.imagePath,
      text_content: null,
      category: "worksheet",
    });

  if (materialError) throw materialError;
}

export async function signedSchoolHomeworkImageUrl(material: SchoolHomeworkMaterial): Promise<string | null> {
  if (material.material_type === "image" && material.text_content?.startsWith("data:image/")) {
    return material.text_content;
  }

  if (material.material_type !== "image" || !material.storage_bucket || !material.storage_path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(material.storage_bucket)
    .createSignedUrl(material.storage_path, 60 * 10);

  if (error) {
    console.error("[school-homework] signed image url error:", error);
    return null;
  }

  return data.signedUrl;
}

export async function listExistingWorksheetImagesForChild(
  childId: string,
  limit = 24
): Promise<ExistingWorksheetImage[]> {
  const [materialsResult, episodesResult] = await Promise.all([
    supabase
      .from("school_homework_materials")
      .select("id, storage_bucket, storage_path, title, created_at, material_type, text_content")
      .eq("child_id", childId)
      .eq("material_type", "image")
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("tutor_episodes")
      .select("id, image_path, concept, created_at")
      .eq("child_id", childId)
      .not("image_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (materialsResult.error) {
    console.error("[school-homework] existing worksheet materials error:", materialsResult.error);
  }
  if (episodesResult.error) {
    console.error("[school-homework] existing worksheet episodes error:", episodesResult.error);
  }

  const candidates: ExistingWorksheetImage[] = [];

  for (const row of materialsResult.data || []) {
    const material = row as SchoolHomeworkMaterial;
    if (!material.storage_bucket || !material.storage_path) continue;
    candidates.push({
      id: `material-${material.id}`,
      bucket: material.storage_bucket,
      path: material.storage_path,
      title: material.title,
      createdAt: material.created_at,
      signedUrl: await signedSchoolHomeworkImageUrl(material),
    });
  }

  for (const row of episodesResult.data || []) {
    const episode = row as {
      id: string;
      image_path: string | null;
      concept?: { label?: string } | null;
      created_at: string;
    };
    if (!episode.image_path) continue;
    const bucket = "worksheets";
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(episode.image_path, 60 * 10);
    if (error) {
      console.error("[school-homework] existing worksheet episode signed url error:", error);
    }
    candidates.push({
      id: `episode-${episode.id}`,
      bucket,
      path: episode.image_path,
      title: episode.concept?.label || "Worksheet",
      createdAt: episode.created_at,
      signedUrl: data?.signedUrl || null,
    });
  }

  const deduped = new Map<string, ExistingWorksheetImage>();
  for (const candidate of candidates) {
    const key = `${candidate.bucket}:${candidate.path}`;
    const existing = deduped.get(key);
    if (!existing || candidate.createdAt > existing.createdAt) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function signedSchoolHomeworkDocumentUrl(material: SchoolHomeworkMaterial): Promise<string | null> {
  if (material.material_type !== "document" || !material.storage_bucket || !material.storage_path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(material.storage_bucket)
    .createSignedUrl(material.storage_path, 60 * 10);

  if (error) {
    console.error("[school-homework] signed document url error:", error);
    return null;
  }

  return data.signedUrl;
}
