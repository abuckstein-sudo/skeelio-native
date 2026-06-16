import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import {
  listRewardRedemptionsForChild,
  listShopItemsForChild,
  requestReward,
  RewardRedemption,
  ShopItem,
} from "@/lib/rewards";

interface Child {
  id: string;
  name: string;
}

export default function StarShopScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [stars, setStars] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const [{ data: childData }, { data: rewardsData }, shopItems, requests] = await Promise.all([
        supabase.from("children").select("id, name").eq("id", childId).maybeSingle(),
        supabase.from("rewards").select("stars").eq("child_id", childId).maybeSingle(),
        listShopItemsForChild(childId),
        listRewardRedemptionsForChild(childId),
      ]);

      setChild(childData ?? null);
      setStars(rewardsData?.stars ?? 0);
      setItems(shopItems);
      setRedemptions(requests);
    } catch (err) {
      console.error("[star-shop] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const requestedByItem = useMemo(() => {
    const map: Record<string, RewardRedemption> = {};
    redemptions
      .filter((r) => ["requested", "approved"].includes(r.status))
      .forEach((r) => {
        map[r.shop_item_id] = r;
      });
    return map;
  }, [redemptions]);

  const handleRequest = async (item: ShopItem) => {
    if (!childId) return;
    setRequestingId(item.id);
    try {
      await requestReward(childId, item);
      await load();
    } catch (err) {
      console.error("[star-shop] request failed:", err);
    } finally {
      setRequestingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={28} color="#111827" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Star shop</Text>
            <Text style={styles.subtitle}>
              {child?.name ? `${child.name}'s rewards` : "Rewards"}
            </Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Stars available</Text>
          <Text style={styles.balanceValue}>⭐ {stars}</Text>
          <Text style={styles.balanceHint}>Ask for a reward when you have enough stars. A parent approves it.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rewards to aim for</Text>
          <Text style={styles.sectionMeta}>{items.length} item{items.length === 1 ? "" : "s"}</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="gift-outline" size={28} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No rewards yet</Text>
            <Text style={styles.emptyText}>Ask a parent to add a few rewards to the shop.</Text>
          </View>
        ) : items.map((item) => {
          const canAfford = stars >= item.cost_stars;
          const request = requestedByItem[item.id];
          const isBusy = requestingId === item.id;
          return (
            <View key={item.id} style={styles.rewardCard}>
              <View style={styles.rewardIcon}>
                <Text style={styles.rewardEmoji}>{item.image_emoji || "🎁"}</Text>
              </View>
              <View style={styles.rewardBody}>
                <Text style={styles.rewardTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.rewardDescription}>{item.description}</Text>
                ) : null}
                <Text style={styles.rewardCost}>⭐ {item.cost_stars}</Text>
              </View>
              {request ? (
                <View style={[styles.statusPill, styles.readyPill]}>
                  <Text style={[styles.statusText, styles.readyText]}>
                    {request.status === "approved" ? "Approved" : "Asked"}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.requestButton, (!canAfford || isBusy) && styles.disabledButton]}
                  onPress={() => handleRequest(item)}
                  disabled={!canAfford || isBusy}
                >
                  <Text style={styles.requestButtonText}>{canAfford ? "Ask" : "Save"}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.parentNote}>
          <MaterialCommunityIcons name="account-heart-outline" size={22} color="#475569" />
          <Text style={styles.parentNoteText}>
            Parents create rewards and approve requests. Stars are spent only when a request is approved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  balanceCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "600",
  },
  balanceValue: {
    fontSize: 38,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 8,
  },
  balanceHint: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563eb",
    textTransform: "uppercase",
  },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  rewardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rewardEmoji: {
    fontSize: 24,
  },
  rewardBody: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  rewardDescription: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 3,
  },
  rewardCost: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 6,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  readyPill: {
    backgroundColor: "#dcfce7",
  },
  savingPill: {
    backgroundColor: "#f1f5f9",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  readyText: {
    color: "#166534",
  },
  savingText: {
    color: "#475569",
  },
  requestButton: {
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  requestButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.45,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 8,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  parentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  parentNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
    fontWeight: "600",
  },
});
