import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const fallbackParentName = (user: User) => {
  const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  const emailName = user.email?.split("@")[0];
  return emailName || "Parent";
};

export async function ensureParentProfile(user: User) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fallbackParentName(user),
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (error) {
    console.warn("[profile] ensure parent profile failed:", error);
  }

  return { error };
}
