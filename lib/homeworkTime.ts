import { supabase } from "./supabase";
import { todayDateKey } from "./schoolHomework";

export type ChildHomeworkLimit = {
  child_id: string;
  parent_id: string;
  daily_limit_minutes: number | null;
  unlocked_date: string | null;
};

export async function getChildHomeworkLimit(childId: string): Promise<ChildHomeworkLimit | null> {
  const { data, error } = await supabase
    .from("child_homework_limits")
    .select("*")
    .eq("child_id", childId)
    .maybeSingle();

  if (error) {
    console.error("[homework-time] fetch limit error:", error);
    return null;
  }

  return data as ChildHomeworkLimit | null;
}

export async function setChildHomeworkLimit(childId: string, minutes: number | null): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("child_homework_limits")
    .upsert({
      child_id: childId,
      parent_id: authData.user.id,
      daily_limit_minutes: minutes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id" });

  if (error) throw error;
}

export async function unlockChildHomeworkForToday(childId: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("child_homework_limits")
    .upsert({
      child_id: childId,
      parent_id: authData.user.id,
      unlocked_date: todayDateKey(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "child_id" });

  if (error) throw error;
}

export async function addHomeworkActiveSeconds(homeworkDayId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;

  const { data, error: readError } = await supabase
    .from("school_homework_days")
    .select("total_active_seconds")
    .eq("id", homeworkDayId)
    .single();

  if (readError) throw readError;

  const current = Number((data as any)?.total_active_seconds || 0);
  const { error } = await supabase
    .from("school_homework_days")
    .update({
      total_active_seconds: current + seconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", homeworkDayId);

  if (error) throw error;
}
