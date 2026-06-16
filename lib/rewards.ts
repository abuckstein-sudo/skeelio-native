import { supabase } from "./supabase";

export type ShopItem = {
  id: string;
  parent_id: string;
  child_id: string | null;
  title: string;
  description: string | null;
  cost_stars: number;
  category: string | null;
  image_emoji: string | null;
  status: "active" | "paused" | "archived";
  created_at: string;
};

export type RewardRedemption = {
  id: string;
  parent_id: string;
  child_id: string;
  shop_item_id: string;
  stars_spent: number;
  status: "requested" | "approved" | "rejected" | "fulfilled" | "cancelled";
  note: string | null;
  requested_at: string;
  approved_at: string | null;
  fulfilled_at: string | null;
  shop_items?: Pick<ShopItem, "title" | "cost_stars" | "image_emoji"> | null;
};

async function getParentId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Not authenticated");
  return data.user.id;
}

export async function listShopItemsForChild(childId: string): Promise<ShopItem[]> {
  const parentId = await getParentId();
  const { data, error } = await supabase
    .from("shop_items")
    .select("*")
    .eq("parent_id", parentId)
    .eq("status", "active")
    .or(`child_id.is.null,child_id.eq.${childId}`)
    .order("cost_stars", { ascending: true });

  if (error) {
    console.error("[rewards] list shop items failed:", error);
    return [];
  }

  return (data ?? []) as ShopItem[];
}

export async function createShopItemForChild(input: {
  childId: string;
  title: string;
  description?: string;
  costStars: number;
  imageEmoji?: string;
}): Promise<ShopItem> {
  const parentId = await getParentId();
  const { data, error } = await supabase
    .from("shop_items")
    .insert({
      parent_id: parentId,
      child_id: input.childId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      cost_stars: input.costStars,
      image_emoji: input.imageEmoji?.trim() || null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[rewards] create shop item failed:", error);
    throw error;
  }

  return data as ShopItem;
}

export async function archiveShopItem(id: string) {
  const { error } = await supabase
    .from("shop_items")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[rewards] archive shop item failed:", error);
    throw error;
  }
}

export async function listRewardRedemptionsForChild(childId: string): Promise<RewardRedemption[]> {
  const parentId = await getParentId();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select("*, shop_items(title, cost_stars, image_emoji)")
    .eq("parent_id", parentId)
    .eq("child_id", childId)
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("[rewards] list redemptions failed:", error);
    return [];
  }

  return (data ?? []) as RewardRedemption[];
}

export async function requestReward(childId: string, item: ShopItem): Promise<RewardRedemption> {
  const parentId = await getParentId();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .insert({
      parent_id: parentId,
      child_id: childId,
      shop_item_id: item.id,
      stars_spent: item.cost_stars,
      status: "requested",
    })
    .select("*, shop_items(title, cost_stars, image_emoji)")
    .single();

  if (error) {
    console.error("[rewards] request reward failed:", error);
    throw error;
  }

  return data as RewardRedemption;
}

export async function updateRedemptionStatus(
  redemption: RewardRedemption,
  status: "approved" | "rejected" | "fulfilled"
) {
  const patch: Record<string, string> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "approved") {
    patch.approved_at = new Date().toISOString();
    await deductStars(redemption.child_id, redemption.stars_spent);
  }

  if (status === "fulfilled") {
    patch.fulfilled_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("reward_redemptions")
    .update(patch)
    .eq("id", redemption.id);

  if (error) {
    console.error("[rewards] update redemption failed:", error);
    throw error;
  }
}

async function deductStars(childId: string, starsSpent: number) {
  const { data, error: fetchError } = await supabase
    .from("rewards")
    .select("stars")
    .eq("child_id", childId)
    .maybeSingle();

  if (fetchError) {
    console.error("[rewards] fetch stars failed:", fetchError);
    throw fetchError;
  }

  const nextStars = Math.max(0, (data?.stars ?? 0) - starsSpent);
  const { error: updateError } = await supabase
    .from("rewards")
    .update({ stars: nextStars })
    .eq("child_id", childId);

  if (updateError) {
    console.error("[rewards] deduct stars failed:", updateError);
    throw updateError;
  }
}
