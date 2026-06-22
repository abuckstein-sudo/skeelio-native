import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { supabase } from "@/lib/supabase";

interface RewardsManagerProps {
  childId: string;
  stars?: number;
  onInputFocus?: () => void;
}

export default function RewardsManager({ childId, stars, onInputFocus }: RewardsManagerProps) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [starBalance, setStarBalance] = useState(stars ?? 0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("50");
  const [description, setDescription] = useState("");
  const [rewardType, setRewardType] = useState<"stars" | "behavior">("stars");
  const [behaviorGoalType, setBehaviorGoalType] = useState<"homework_days" | "practice_sessions" | "perfect_sessions" | "helper_confirmed">("homework_days");
  const [behaviorGoalCount, setBehaviorGoalCount] = useState("5");
  const [language, setLanguage] = useState<"en" | "fr">("en");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shopItems, requests, currentStars, childData] = await Promise.all([
        listShopItemsForChild(childId),
        listRewardRedemptionsForChild(childId),
        getStarsForChild(childId),
        supabase
          .from("children")
          .select("preferred_language")
          .eq("id", childId)
          .maybeSingle(),
      ]);
      setItems(shopItems);
      setRedemptions(requests);
      setStarBalance(currentStars);
      setLanguage((childData.data as any)?.preferred_language === "fr" ? "fr" : "en");
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
    const goalCount = Number(behaviorGoalCount);
    if (rewardType === "behavior" && (!Number.isInteger(goalCount) || goalCount <= 0)) {
      Alert.alert("Invalid goal", "Choose a whole number greater than 0.");
      return;
    }

    setSaving(true);
    try {
      Keyboard.dismiss();
      await createShopItemForChild({
        childId,
        title,
        description,
        costStars,
        rewardType,
        behaviorGoalType,
        behaviorGoalCount: rewardType === "behavior" ? goalCount : null,
        imageEmoji: "🎁",
      });
      setTitle("");
      setDescription("");
      setCost("50");
      setRewardType("stars");
      setBehaviorGoalType("homework_days");
      setBehaviorGoalCount("5");
      await load();
    } catch {
      Alert.alert("Could not save reward", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: ShopItem) => {
    const titleText = language === "fr" ? "Supprimer la récompense ?" : "Delete reward?";
    const bodyText = language === "fr"
      ? `Es-tu sûr de vouloir supprimer la récompense « ${item.title} » ?`
      : `Are you sure you want to delete the "${item.title}" reward?`;
    const cancelText = language === "fr" ? "Annuler" : "Cancel";
    const deleteText = language === "fr" ? "Supprimer" : "Delete";

    Alert.alert(titleText, bodyText, [
      { text: cancelText, style: "cancel" },
      {
        text: deleteText,
        style: "destructive",
        onPress: async () => {
          try {
            await archiveShopItem(item.id);
            await load();
          } catch {
            Alert.alert(
              language === "fr" ? "Suppression impossible" : "Could not delete reward",
              language === "fr" ? "Réessaie dans un instant." : "Please try again."
            );
          }
        },
      },
    ]);
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
  const costStars = Number(cost);
  const effortPreview = Number.isFinite(costStars) && costStars > 0
    ? estimateStarEffort(costStars)
    : "Enter stars to see the effort.";

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
        <View style={styles.rewardTypeRow}>
          <TouchableOpacity
            style={[styles.typeButton, rewardType === "stars" && styles.typeButtonActive]}
            onPress={() => setRewardType("stars")}
          >
            <Text style={[styles.typeButtonText, rewardType === "stars" && styles.typeButtonTextActive]}>Stars</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, rewardType === "behavior" && styles.typeButtonActive]}
            onPress={() => setRewardType("behavior")}
          >
            <Text style={[styles.typeButtonText, rewardType === "behavior" && styles.typeButtonTextActive]}>Behavior</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Reward name"
          value={title}
          onChangeText={setTitle}
          editable={!saving}
          returnKeyType="next"
          onFocus={onInputFocus}
        />
        <TextInput
          style={styles.input}
          placeholder="Optional description"
          value={description}
          onChangeText={setDescription}
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          onFocus={onInputFocus}
        />
        <View style={styles.costRow}>
          <TextInput
            style={[styles.input, styles.costInput]}
            placeholder="Stars"
            value={cost}
            onChangeText={setCost}
            keyboardType="number-pad"
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            onFocus={onInputFocus}
          />
          <TouchableOpacity style={styles.doneButton} onPress={Keyboard.dismiss}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, saving && styles.disabledButton]}
            onPress={handleCreate}
            disabled={saving}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {rewardType === "stars" ? (
          <View style={styles.effortBox}>
            <MaterialCommunityIcons name="calculator-variant-outline" size={18} color="#1565c0" />
            <Text style={styles.effortText}>{effortPreview}</Text>
          </View>
        ) : (
          <View style={styles.behaviorBox}>
            <Text style={styles.behaviorLabel}>Earn by completing</Text>
            <View style={styles.costRow}>
              <TextInput
                style={[styles.input, styles.behaviorCountInput]}
                value={behaviorGoalCount}
                onChangeText={setBehaviorGoalCount}
                keyboardType="number-pad"
                placeholder="Count"
                onFocus={onInputFocus}
              />
              <View style={styles.behaviorOptions}>
                {[
                  ["homework_days", "homework days"],
                  ["practice_sessions", "practice sessions"],
                  ["perfect_sessions", "perfect sessions"],
                  ["helper_confirmed", "helper-confirmed sessions"],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.behaviorOption, behaviorGoalType === value && styles.behaviorOptionActive]}
                    onPress={() => setBehaviorGoalType(value as any)}
                  >
                    <Text style={[styles.behaviorOptionText, behaviorGoalType === value && styles.behaviorOptionTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
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
                  {item.reward_type === "behavior"
                    ? behaviorSummary(item)
                    : `⭐ ${item.cost_stars}`}
                  {item.description ? ` • ${item.description}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={() => handleArchive(item)}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function estimateStarEffort(costStars: number) {
  const homeworkSessions = Math.ceil(costStars / 8);
  const perfectSessions = Math.ceil(costStars / 13);
  return `About ${homeworkSessions} normal homework sessions, or ${perfectSessions} very strong sessions.`;
}

function behaviorSummary(item: ShopItem) {
  const count = item.behavior_goal_count || 1;
  const labels: Record<string, string> = {
    homework_days: "homework days",
    practice_sessions: "practice sessions",
    perfect_sessions: "perfect sessions",
    helper_confirmed: "helper-confirmed sessions",
  };
  return `${count} ${labels[item.behavior_goal_type || "homework_days"]}`;
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
  rewardTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
  },
  typeButtonTextActive: {
    color: "#1d4ed8",
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
  effortBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },
  effortText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#1e3a8a",
    fontWeight: "700",
  },
  behaviorBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
  },
  behaviorLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166534",
    marginBottom: 8,
  },
  behaviorCountInput: {
    width: 76,
    marginBottom: 0,
  },
  behaviorOptions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  behaviorOption: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  behaviorOptionActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  behaviorOptionText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#166534",
  },
  behaviorOptionTextActive: {
    color: "#fff",
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
  doneButton: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
  },
  doneButtonText: {
    color: "#334155",
    fontWeight: "800",
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
