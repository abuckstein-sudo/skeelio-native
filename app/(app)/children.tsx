import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

interface Child {
  id: string;
  name: string;
  grade_level: string;
}

export default function ChildrenScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchChildren();
  }, []);

  const fetchChildren = async () => {
    setIsLoading(true);
    setError("");

    const { data, error: dbError } = await supabase
      .from("children")
      .select("id, name, grade_level");

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

  const handleSelectChild = (childId: string) => {
    console.log("[nav] child selected:", childId);
    router.push({
      pathname: "/child-home/[childId]",
      params: { childId },
    });
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
              onPress={() => handleSelectChild(item.id)}
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
      />

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
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
});
