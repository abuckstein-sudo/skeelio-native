import { supabase } from "./supabase";
import { createMathAssignment, deleteAssignment } from "./assignments";
import { listSpellingListsForChild, SpellingList } from "./spelling";

export type SchoolHomeworkKind = "generic" | "reading" | "spelling" | "multiplication" | "signature";
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
  completed_by: "child" | "adult" | null;
};

export type SchoolHomeworkDay = {
  id: string;
  parent_id: string;
  child_id: string;
  homework_date: string;
  source_type: "manual" | "photo";
  raw_input: string | null;
  status: "active" | "complete" | "archived";
  total_active_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  school_homework_items?: SchoolHomeworkItem[];
};

export type ParsedSchoolHomeworkItem = {
  task_text: string;
  task_kind: SchoolHomeworkKind;
  metadata: Record<string, unknown>;
  linked_assignment_id?: string | null;
  linked_spelling_list_id?: string | null;
};

export function todayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function schoolHomeworkDateLabel(dateKey: string, locale: "en" | "fr" = "en"): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
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

function multiplicationTables(taskText: string): number[] {
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

  const single = normalized.match(/\b(?:table|tables|multiplication|multiplier).*?(\d{1,2})\s*x?\b/) ||
    normalized.match(/\b(\d{1,2})\s*x\b/);
  if (single) {
    const table = Number(single[1]);
    if (Number.isInteger(table) && table >= 0 && table <= 12) return [table];
  }

  return [];
}

export function parseSchoolHomeworkInput(rawInput: string, spellingLists: SpellingList[] = []): ParsedSchoolHomeworkItem[] {
  return rawInput
    .split(/\r?\n/g)
    .map(cleanLine)
    .filter(Boolean)
    .map((taskText) => {
      const normalized = normalizeText(taskText);
      const spellingRef = findSpellingListReference(taskText, spellingLists);
      const tables = multiplicationTables(taskText);

      if (/(faire signer|signer|signature|faire signer quiz|sign quiz)/.test(normalized)) {
        return {
          task_text: taskText,
          task_kind: "signature" as const,
          metadata: { requires_parent_signature: true },
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

      if (normalized.includes("multiplication") || normalized.includes("tables")) {
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
        return {
          task_text: taskText,
          task_kind: "reading" as const,
          metadata: {
            reference: taskText.match(/\bR\s*\d+(?:\s*(?:a|à|-|to)\s*R?\s*\d+)?/i)?.[0] || null,
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

export async function replaceSchoolHomeworkDay(params: {
  childId: string;
  homeworkDate: string;
  rawInput: string;
  sourceType?: "manual" | "photo";
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

  const oldLinkedAssignmentIds = ((await supabase
    .from("school_homework_items")
    .select("linked_assignment_id")
    .eq("homework_day_id", day.id)
    .not("linked_assignment_id", "is", null)).data || [])
    .map((row: any) => row.linked_assignment_id)
    .filter(Boolean);

  await Promise.all(
    Array.from(new Set(oldLinkedAssignmentIds)).map((assignmentId) =>
      deleteAssignment(assignmentId).catch((err) => {
        console.error("[school-homework] old linked assignment delete error:", err);
      })
    )
  );

  const { error: deleteError } = await supabase
    .from("school_homework_items")
    .delete()
    .eq("homework_day_id", day.id);

  if (deleteError) throw deleteError;

  if (parsedItems.length > 0) {
    const linkedItems = await Promise.all(
      parsedItems.map(async (item) => {
        const tables = Array.isArray(item.metadata.tables)
          ? (item.metadata.tables as unknown[]).filter((table): table is number => typeof table === "number")
          : [];

        if (item.task_kind === "multiplication" && tables.length > 0) {
          try {
            const assignment = await createMathAssignment({
              childId: params.childId,
              topic: "multiplication",
              count: 20,
              dueDate: params.homeworkDate,
              mode: "practice",
              multiplicationTables: tables,
            });
            return {
              ...item,
              linked_assignment_id: assignment.id,
              metadata: {
                ...item.metadata,
                linked_practice: "multiplication",
              },
            };
          } catch (err) {
            console.error("[school-homework] multiplication assignment create error:", err);
          }
        }

        return item;
      })
    );

    const { error: itemError } = await supabase.from("school_homework_items").insert(
      linkedItems.map((item, index) => ({
        homework_day_id: day.id,
        parent_id: parentId,
        child_id: params.childId,
        task_text: item.task_text,
        task_kind: item.task_kind,
        status: item.task_kind === "signature" ? "waiting_parent" : "pending",
        sort_order: index,
        metadata: item.metadata,
        linked_assignment_id: item.linked_assignment_id || null,
        linked_spelling_list_id: item.linked_spelling_list_id || null,
      }))
    );

    if (itemError) throw itemError;
  }

  return listSchoolHomeworkDay(params.childId, params.homeworkDate) as Promise<SchoolHomeworkDay>;
}

export async function listSchoolHomeworkDay(childId: string, homeworkDate = todayDateKey()): Promise<SchoolHomeworkDay | null> {
  const { data, error } = await supabase
    .from("school_homework_days")
    .select("*, school_homework_items(*)")
    .eq("child_id", childId)
    .eq("homework_date", homeworkDate)
    .neq("status", "archived")
    .maybeSingle();

  if (error) {
    console.error("[school-homework] list day error:", error);
    return null;
  }

  if (!data) return null;
  const items = ((data as any).school_homework_items || []) as SchoolHomeworkItem[];
  return {
    ...(data as SchoolHomeworkDay),
    school_homework_items: items.sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function setSchoolHomeworkItemDone(
  item: Pick<SchoolHomeworkItem, "id" | "status">,
  done: boolean,
  completedBy: "child" | "adult" = "child"
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (error) throw error;
}
