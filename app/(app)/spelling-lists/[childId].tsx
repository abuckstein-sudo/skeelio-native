import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { listSpellingListsForChild, type SpellingList } from "@/lib/spelling";

export default function SpellingListsScreen() {
  const router = useRouter();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [lists, setLists] = useState<SpellingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;

    const loadLists = async () => {
      try {
        const data = await listSpellingListsForChild(childId);
        setLists(data);
        setIsLoading(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load lists";
        setError(msg);
        setIsLoading(false);
      }
    };

    loadLists();
  }, [childId]);

  const handleListTap = (listId: string) => {
    if (childId) {
      router.push({
        pathname: "/spelling/[listId]",
        params: { listId, childId },
      });
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.errorText}>{error}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Spelling Lists</Text>
        <Text style={styles.subtitle}>Choose a list to practice</Text>

        {lists.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No spelling lists yet</Text>
            <Text style={styles.emptySubtext}>
              Check with your parent to create or upload a list.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {lists.map((list) => (
              <TouchableOpacity
                key={list.id}
                style={styles.listCard}
                onPress={() => handleListTap(list.id)}
              >
                <View style={styles.listInfo}>
                  <Text style={styles.listTitle}>{list.title}</Text>
                  <Text style={styles.listMeta}>
                    {list.language} · {list.source_type === "photo" ? "📷 From photo" : "✏️ Typed"}
                  </Text>
                </View>
                <Text style={styles.playIcon}>▶</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  backButton: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196f3",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  emptyBox: {
    backgroundColor: "#f0f8ff",
    padding: 28,
    borderRadius: 12,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#2196f3",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  listContainer: {
    gap: 12,
  },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 8,
  },
  listInfo: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  listMeta: {
    fontSize: 12,
    color: "#999",
  },
  playIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2196f3",
    marginLeft: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#d32f2f",
    textAlign: "center",
  },
});
