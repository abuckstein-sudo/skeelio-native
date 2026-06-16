import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  archiveShopItem,
  createShopItemForChild,
  getStarsForChild,
  listRewardRedemptionsForChild,
  listShopItemsForChild,
  RewardRedemption,
  ShopItem,
  updateRedemptionStatus,
} from "@/lib/rewards";

export default function RewardsManager({ childId, stars }: { childId: string; stars?: number }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [starBalance, setStarBalance] = useState(stars ?? 0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("50");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shopItems, requests, currentStars] = await Promise.all([
        listShopItemsForChild(childId),
        listRewardRedemptionsForChild(childId),
        getStarsForChild(childId),
      ]);
      setItems(shopItems);
      setRedemptions(requests);
      setStarBalance(currentStars);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    if (typeof stars === "number") setStarBalance(stars);
  }, [stars]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const costStars = Number(cost);
    if (!title.trim()) {
      Alert.alert("Missing title", "Add a short reward name.");
      return;
    }
    if (!Number.isFinite(costStars) || costStars <= 0) {
      Alert.alert("Invalid cost", "Choose a star cost greater than 0.");
      return;
    }

    setSaving(true);
    try {
      await createShopItemForChild({
        childId,
        title,
        description,
        costStars,
        imageEmoji: "🎁",
      });
      setTitle("");
      setDescription("");
      setCost("50");
      await load();
    } catch {
      Alert.alert("Could not save reward", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: ShopItem) => {
    try {
      await archiveShopItem(item.id);
      await load();
    } catch {
      Alert.alert("Could not archive reward", "Please try again.");
    }
  };

  const handleStatus = async (
    redemption: RewardRedemption,
    status: "approved" | "rejected" | "fulfilled"
  ) => {
    try {
      await updateRedemptionStatus(redemption, status);
      await load();
    } catch {
      Alert.alert("Could not update request", "Please try again.");
    }
  };

  const pending = redemptions.filter((r) => r.status === "requested");

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Rewards shop</Text>
          <Text style={styles.sectionSubtitle}>⭐ {starBalance} available</Text>
        </View>
        {loading && <ActivityIndicator color="#2563eb" />}
      </View>

      {pending.length > 0 && (
        <View style={styles.requestsBox}>
          <Text style={styles.blockTitle}>Reward requests</Text>
          {pending.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <View style={styles.requestText}>
                <Text style={styles.itemTitle}>
                  {request.shop_items?.image_emoji || "🎁"} {request.shop_items?.title || "Reward"}
                </Text>
                <Text style={styles.itemMeta}>Costs ⭐ {request.stars_spent}</Text>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.smallButton, styles.rejectButton]}
                  onPress={() => handleStatus(request, "rejected")}
                >
                  <Text style={styles.rejectText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, styles.approveButton]}
                  onPress={() => handleStatus(request, "approved")}
                >
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Add a reward</Text>
        <TextInput
          style={styles.input}
          placeholder="Reward name"
          value={title}
          onChangeText={setTitle}
          editable={!saving}
        />
        <TextInput
          style={styles.input}
          placeholder="Optional description"
          value={description}
          onChangeText={setDescription}
          editable={!saving}
        />
        <View style={styles.costRow}>
          <TextInput
            style={[styles.input, styles.costInput]}
            placeholder="Stars"
            value={cost}
            onChangeText={setCost}
            keyboardType="number-pad"
            editable={!saving}
          />
          <TouchableOpacity
            style={[styles.addButton, saving && styles.disabledButton]}
            onPress={handleCreate}
            disabled={saving}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.itemsBox}>
        <Text style={styles.blockTitle}>Shop items</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No rewards yet. Add one above.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>
                  {item.image_emoji || "🎁"} {item.title}
                </Text>
                <Text style={styles.itemMeta}>
                  ⭐ {item.cost_stars}
                  {item.description ? ` • ${item.description}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={() => handleArchive(item)}>
                <MaterialCommunityIcons name="archive-outline" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 8,
  },
  requestsBox: {
    backgroundColor: "#fefce8",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  requestRow: {
    gap: 10,
    paddingVertical: 8,
  },
  requestText: {
    gap: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejectButton: {
    backgroundColor: "#fee2e2",
  },
  approveButton: {
    backgroundColor: "#dcfce7",
  },
  rejectText: {
    color: "#991b1b",
    fontWeight: "800",
  },
  approveText: {
    color: "#166534",
    fontWeight: "800",
  },
  form: {
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  costRow: {
    flexDirection: "row",
    gap: 8,
  },
  costInput: {
    flex: 1,
    marginBottom: 0,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  itemsBox: {
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  itemText: {
    flex: 1,
    paddingRight: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  itemMeta: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  iconButton: {
    padding: 8,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
  },
});
