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
  const { error } = await supabase.rpc("ensure_current_parent_profile", {
    fallback_full_name: fallbackParentName(user),
  });

  if (error) {
    console.warn("[profile] ensure parent profile failed:", error);
  }

  return { error };
}
