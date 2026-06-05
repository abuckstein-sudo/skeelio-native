import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function PracticeScreen() {
  const router = useRouter();
  const { childId, topic } = useLocalSearchParams<{
    childId: string;
    topic: string;
  }>();

  console.log("[practice] params", { childId, topic });

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Practice: {topic}</Text>
      <TouchableOpacity style={styles.button} onPress={handleBack}>
        <Text style={styles.buttonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 32,
    color: "#1a1a1a",
  },
  button: {
    backgroundColor: "#0000ff",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
