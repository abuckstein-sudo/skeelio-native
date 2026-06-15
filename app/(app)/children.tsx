import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GiraffeBackground from "@/components/GiraffeBackground";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  school_system?: string;
  pin: string;
  selected_avatar?: string;
}

const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

const formatGrade = (child: Child): string => {
  const g = String(child.grade_level ?? "").trim();
  if (!g) return "";
  const sys = String(child.school_system ?? "").toLowerCase();
  const frenchCode = /^(cp|ce[12]|cm[12]|6e|5e|4e|3e)$/i.test(g);
  if (sys.includes("france") || sys.includes("french") || frenchCode) return g.toUpperCase();
  if (/^grade\b/i.test(g)) return g;
  return `Grade ${g}`;
};

export default function ChildrenScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [children, setChildren] = useState<Child[]>([]);
  const [childrenStars, setChildrenStars] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [selectedChildForPin, setSelectedChildForPin] = useState<Child | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const pinInputRef = useRef<TextInput>(null);
  const childTileWidth = Math.max(140, (width - 64) / 2);

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkOnboarding = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;

      const seen = await AsyncStorage.getItem(`skeelio:onboardingSeen:${userId}`);
      if (!seen && !cancelled) {
        router.replace("/(app)/onboarding");
      }
    };

    checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (pinModalVisible) {
      // Autofocus the PIN input after modal opens (iOS modals often don't autofocus reliably)
      const focusTimer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(focusTimer);
    }
  }, [pinModalVisible]);

  const fetchChildren = async () => {
    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, school_system, pin, selected_avatar");

    if (dbError) {
      console.log("[nav] children fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    console.log("[nav] children fetched:", data?.length);
    const childrenData = data || [];
    setChildren(childrenData);

    // Fetch stars for each child
    const starsMap: Record<string, number> = {};
    for (const child of childrenData) {
      const { data: rewardsData } = await supabase
        .from("rewards")
        .select("stars")
        .eq("child_id", child.id)
        .maybeSingle();
      starsMap[child.id] = rewardsData?.stars ?? 0;
    }
    setChildrenStars(starsMap);
    setIsLoading(false);
  };

  const handleSelectChild = (child: Child) => {
    console.log("[nav] opening PIN for:", child.id);
    setSelectedChildForPin(child);
    setPinModalVisible(true);
    setEnteredPin("");
    setPinError("");
  };

  const handlePinSubmit = () => {
    if (!selectedChildForPin) return;

    if (enteredPin === selectedChildForPin.pin) {
      console.log("[nav] PIN correct, navigating to child home");
      setPinModalVisible(false);
      setEnteredPin("");
      setPinError("");
      router.push({
        pathname: "/child-home/[childId]",
        params: { childId: selectedChildForPin.id },
      });
    } else {
      console.log("[nav] PIN incorrect");
      setPinError("Wrong PIN — try again");
      setEnteredPin("");
      // Refocus the input immediately for retry
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    }
  };

  const handlePinCancel = () => {
    console.log("[nav] PIN cancelled");
    setPinModalVisible(false);
    setSelectedChildForPin(null);
    setEnteredPin("");
    setPinError("");
  };

  const handleParent = (childId: string) => {
    console.log("[nav] parent dashboard:", childId);
    router.push({
      pathname: "/child/[id]",
      params: { id: childId },
    });
  };

  const handleParentSection = () => {
    console.log("[nav] opening parent section");
    router.push("/(app)/parent");
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <GiraffeBackground />
      <View style={styles.header}>
        <Text style={styles.title}>Skeelio</Text>
        <TouchableOpacity
          style={styles.parentHeaderButton}
          onPress={handleParentSection}
        >
          <MaterialCommunityIcons name="account-circle" size={24} color="#333" />
          <Text style={styles.parentHeaderText}>Parent</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.contentWrapper}>
        {children.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No children added yet</Text>
            <TouchableOpacity
              style={styles.addChildButton}
              onPress={() =>
                router.push({
                  pathname: "/child-settings/[childId]",
                  params: { childId: "new", mode: "add" },
                })
              }
            >
              <Text style={styles.addChildButtonText}>+ Add a child</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={children}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.childTile, { width: childTileWidth }]}
                onPress={() => handleSelectChild(item)}
              >
                {item.selected_avatar && (
                  <Text style={styles.avatarEmoji}>
                    {AVATAR_EMOJI[item.selected_avatar] || AVATAR_EMOJI.fox}
                  </Text>
                )}
                <Text style={styles.childName} numberOfLines={1} ellipsizeMode="tail">
                  {item.name}
                </Text>
                {formatGrade(item) && (
                  <Text style={styles.childGrade}>{formatGrade(item)}</Text>
                )}
                <Text style={styles.starsText}>⭐ {childrenStars[item.id] ?? 0}</Text>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
          />
        )}
      </View>

      {/* PIN Modal */}
      <Modal
        visible={pinModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handlePinCancel}
      >
        <View style={styles.pinModalOverlay}>
          <View style={styles.pinModalContainer}>
            <Text style={styles.pinModalTitle}>
              {selectedChildForPin?.name}'s PIN
            </Text>

            <TextInput
              ref={pinInputRef}
              style={styles.pinInput}
              placeholder="Enter 4–6 digits"
              keyboardType="number-pad"
              secureTextEntry={true}
              maxLength={6}
              value={enteredPin}
              onChangeText={setEnteredPin}
              autoFocus={true}
            />

            {pinError && <Text style={styles.pinError}>{pinError}</Text>}

            <View style={styles.pinButtonContainer}>
              <TouchableOpacity
                style={[styles.pinButton, styles.pinButtonStart]}
                onPress={handlePinSubmit}
                disabled={enteredPin.length < 4}
              >
                <Text style={styles.pinButtonText}>Start</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pinButton, styles.pinButtonCancel]}
                onPress={handlePinCancel}
              >
                <Text style={styles.pinButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#333",
    fontFamily: "Lora_700Bold",
  },
  parentHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  parentHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
    maxWidth: "100%",
    backgroundColor: "transparent",
  },
  error: {
    color: "#d32f2f",
    marginHorizontal: 20,
    marginBottom: 12,
    textAlign: "center",
  },
  childTile: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#fefdfb",
    alignItems: "center",
    justifyContent: "center",
    height: 160,
    margin: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  childName: {
    width: "100%",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  childGrade: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    textAlign: "center",
  },
  starsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffc107",
    marginTop: 8,
  },
  columnWrapper: {
    gap: 0,
    justifyContent: "flex-start",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  emptyStateText: {
    fontSize: 18,
    color: "#666",
    marginBottom: 20,
  },
  addChildButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#f0f8ff",
    borderWidth: 2,
    borderColor: "#2196f3",
    borderStyle: "dashed",
    alignItems: "center",
  },
  addChildButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2196f3",
  },
  pinModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  pinModalContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
  },
  pinModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 20,
  },
  pinInput: {
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 4,
    marginBottom: 12,
    width: "100%",
  },
  pinError: {
    color: "#d32f2f",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
  },
  pinButtonContainer: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
    marginTop: 12,
  },
  pinButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  pinButtonStart: {
    backgroundColor: "#0000ff",
  },
  pinButtonCancel: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  pinButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  pinButtonCancelText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "700",
  },
});
