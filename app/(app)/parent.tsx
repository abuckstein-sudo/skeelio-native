import { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/app/_layout";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ChildSnapshot from "@/components/ChildSnapshot";
import ParentProofSection from "@/components/ParentProofSection";
import RewardsManager from "@/components/RewardsManager";
import SchoolHomeworkManager from "@/components/SchoolHomeworkManager";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  school_system?: string;
  selected_avatar?: string;
  intro_seen?: boolean;
}

type ParentTab = "today" | "assign" | "progress" | "rewards";

const AVATAR_EMOJI: Record<string, string> = {
  cat: "🐱",
  owl: "🦉",
  fox: "🦊",
  bear: "🐻",
  rabbit: "🐰",
  panda: "🐼",
};

export default function ParentScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const contentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [parentName, setParentName] = useState("");
  const [activeTab, setActiveTab] = useState<ParentTab>("today");

  useFocusEffect(
    useCallback(() => {
      fetchChildren();
      fetchParentName();
    }, [])
  );

  const fetchParentName = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (data?.full_name) {
        setParentName(data.full_name);
      }
    } catch (err) {
      console.error("[parent] error fetching parent name:", err);
    }
  };

  const fetchChildren = async () => {
    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, school_system, selected_avatar, intro_seen");

    if (dbError) {
      console.log("[parent] children fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    const childrenData = data || [];
    console.log("[parent] children fetched:", childrenData.length);
    setChildren(childrenData);

    if (childrenData.length > 0 && !selectedChildId) {
      setSelectedChildId(childrenData[0].id);
    }

    setIsLoading(false);
  };

  const handleAssign = () => {
    if (!selectedChildId) {
      Alert.alert("No child selected", "Please select a child first");
      return;
    }
    const selected = children.find((c) => c.id === selectedChildId);
    router.push({
      pathname: "/(app)/assign",
      params: { childId: selectedChildId, childName: selected?.name || "" },
    });
  };

  const handleAccountSettings = () => {
    setShowMenu(false);
    router.push("/(app)/account-settings");
  };

  const handleEditChild = () => {
    if (!selectedChildId) {
      Alert.alert("No child selected", "Please select a child first");
      return;
    }
    router.push({
      pathname: "/child-settings/[childId]",
      params: { childId: selectedChildId, mode: "edit" },
    });
  };

  const handleAddChild = () => {
    setShowMenu(false);
    router.push({
      pathname: "/child-settings/[childId]",
      params: { childId: "new", mode: "add" },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const scrollRewardsFormIntoView = useCallback(() => {
    setTimeout(() => {
      contentScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, []);

  const handleLogout = () => {
    setShowMenu(false);
    Alert.alert(
      "Log out?",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", onPress: () => {}, style: "cancel" },
        {
          text: "Log out",
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              console.log("[auth] logout error:", error.message);
              setError(error.message);
              return;
            }
            console.log("[auth] logged out");
          },
          style: "destructive",
        },
      ]
    );
  };

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const tabs: { id: ParentTab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { id: "today", label: "Today", icon: "calendar-today" },
    { id: "assign", label: "Assign", icon: "playlist-plus" },
    { id: "progress", label: "Progress", icon: "chart-line" },
    { id: "rewards", label: "Rewards", icon: "star-outline" },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196f3" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Greeting and Menu Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.greeting}>Hello 👋</Text>
          {parentName && (
            <Text style={styles.parentName}>{parentName}</Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenu(true)}>
            <MaterialCommunityIcons name="account-circle-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {children.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No children yet</Text>
          <TouchableOpacity
            style={styles.addFirstChildButton}
            onPress={handleAddChild}
          >
            <Text style={styles.addFirstChildButtonText}>Add a child</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={contentScrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {/* Child Switcher */}
          <View style={styles.childSwitcher}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childSwitcherContent}
              style={{ flex: 1 }}
            >
              {children.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.childButton,
                    selectedChildId === child.id && styles.childButtonActive,
                  ]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  {child.intro_seen && child.selected_avatar && (
                    <Text style={styles.childButtonAvatar}>
                      {AVATAR_EMOJI[child.selected_avatar] || AVATAR_EMOJI.fox}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.childButtonName,
                      selectedChildId === child.id &&
                        styles.childButtonNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {child.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.editChildButton} onPress={handleEditChild}>
              <MaterialCommunityIcons name="cog" size={22} color="#2196f3" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabBar}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabButton, selected && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={17}
                    color={selected ? "#1565c0" : "#607d8b"}
                  />
                  <Text style={[styles.tabButtonText, selected && styles.tabButtonTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedChild && (
            <>
              {activeTab === "today" && (
                <>
                  <SchoolHomeworkManager childId={selectedChild.id} />
                  <View style={styles.previewSection}>
                    <ChildSnapshot
                      childId={selectedChild.id}
                      childName={selectedChild.name}
                      grade={selectedChild.grade_level || ""}
                      avatar={selectedChild.selected_avatar || "fox"}
                    />
                  </View>
                </>
              )}

              {activeTab === "assign" && (
                <View style={styles.assignPanel}>
                  <View style={styles.assignPanelHeader}>
                    <Text style={styles.assignPanelTitle}>Assignment tools</Text>
                    <Text style={styles.assignPanelBody}>
                      Create standalone practice, or use the Practice button on a school-homework item to link it directly.
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.primaryActionButton} onPress={handleAssign}>
                    <MaterialCommunityIcons name="playlist-plus" size={20} color="#fff" />
                    <Text style={styles.primaryActionButtonText}>Open assignment tools</Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeTab === "progress" && (
                <>
                  <ChildSnapshot
                    childId={selectedChild.id}
                    childName={selectedChild.name}
                    grade={selectedChild.grade_level || ""}
                    avatar={selectedChild.selected_avatar || "fox"}
                  />
                  <ParentProofSection childId={selectedChild.id} />
                </>
              )}

              {activeTab === "rewards" && (
                <View style={styles.rewardSection}>
                  <RewardsManager childId={selectedChild.id} onInputFocus={scrollRewardsFormIntoView} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContent}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleAccountSettings}
            >
              <MaterialCommunityIcons name="cog" size={20} color="#2196f3" />
              <Text style={styles.menuItemText}>Account settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleAddChild}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#2196f3" />
              <Text style={styles.menuItemText}>Add a child</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleLogout}
            >
              <MaterialCommunityIcons
                name="power"
                size={20}
                color="#d32f2f"
              />
              <Text style={styles.menuItemDestructiveText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 12,
  },
  backButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  parentName: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  menuButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#2196f3",
    alignItems: "center",
    gap: 2,
  },
  menuButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  menuButtonLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 96,
  },
  childSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  editChildButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  childSwitcherContent: {
    paddingHorizontal: 12,
    gap: 8,
    paddingRight: 12,
  },
  childButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 4,
  },
  childButtonActive: {
    backgroundColor: "#e3f2fd",
    borderColor: "#2196f3",
  },
  childButtonAvatar: {
    fontSize: 24,
  },
  childButtonName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    maxWidth: 80,
  },
  childButtonNameActive: {
    color: "#2196f3",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f6f8f8",
    borderBottomWidth: 1,
    borderBottomColor: "#e8eeee",
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabButtonActive: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cfe8fb",
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#607d8b",
  },
  tabButtonTextActive: {
    color: "#1565c0",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  rewardSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  previewSection: {
    marginTop: 6,
  },
  assignPanel: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8e5",
    backgroundColor: "#fff",
  },
  assignPanelHeader: {
    marginBottom: 14,
  },
  assignPanelTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#263238",
    marginBottom: 5,
  },
  assignPanelBody: {
    fontSize: 13,
    lineHeight: 18,
    color: "#607d8b",
  },
  primaryActionButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#2196f3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginBottom: 24,
    textAlign: "center",
  },
  addFirstChildButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#2196f3",
    borderRadius: 8,
    alignItems: "center",
  },
  addFirstChildButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  error: {
    color: "#d32f2f",
    marginHorizontal: 16,
    marginVertical: 8,
    textAlign: "center",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  menuContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 0,
    maxHeight: "70%",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  menuItemDestructive: {
    borderBottomWidth: 0,
  },
  menuItemDestructiveText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#d32f2f",
  },
  menuDivider: {
    height: 8,
    backgroundColor: "#f5f5f5",
  },
});
