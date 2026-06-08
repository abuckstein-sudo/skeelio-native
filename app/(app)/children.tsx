import { useEffect, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

interface Child {
  id: string;
  name: string;
  grade_level: string;
  pin: string;
  selected_avatar?: string;
}

export default function ChildrenScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [selectedChildForPin, setSelectedChildForPin] = useState<Child | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    fetchChildren();
  }, []);

  const fetchChildren = async () => {
    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level, pin, selected_avatar");

    if (dbError) {
      console.log("[nav] children fetch error:", dbError.message);
      setError(dbError.message);
      setIsLoading(false);
      return;
    }

    console.log("[nav] children fetched:", data?.length);
    setChildren(data || []);
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

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.log("[auth] logout error:", error.message);
      setError(error.message);
      return;
    }
    console.log("[auth] logged out");
    // Auth state change will trigger routing back to login
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
      <Text style={styles.title}>Who's Learning?</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.childRowContainer}>
            <TouchableOpacity
              style={styles.childRow}
              onPress={() => handleSelectChild(item)}
            >
              <View>
                <Text style={styles.childName}>{item.name}</Text>
                <Text style={styles.childGrade}>Grade {item.grade_level}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.parentButton}
              onPress={() => handleParent(item.id)}
            >
              <Text style={styles.parentButtonText}>Parent</Text>
            </TouchableOpacity>
          </View>
        )}
        scrollEnabled={false}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addChildButton}
            onPress={() =>
              router.push({
                pathname: "/child-settings/[childId]",
                params: { mode: "add" },
              })
            }
          >
            <Text style={styles.addChildButtonText}>+ Add a child</Text>
          </TouchableOpacity>
        }
      />

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>

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
              style={styles.pinInput}
              placeholder="Enter 4–6 digits"
              keyboardType="number-pad"
              secureTextEntry={true}
              maxLength={6}
              value={enteredPin}
              onChangeText={setEnteredPin}
              editable={!pinError}
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
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  error: {
    color: "#d32f2f",
    marginBottom: 12,
    textAlign: "center",
  },
  childRowContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  childRow: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
  },
  childName: {
    fontSize: 18,
    fontWeight: "600",
  },
  childGrade: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  parentButton: {
    backgroundColor: "#2196f3",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  parentButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  logoutButton: {
    marginTop: "auto",
    marginBottom: 20,
    backgroundColor: "#d32f2f",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
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
  addChildButton: {
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
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
});
