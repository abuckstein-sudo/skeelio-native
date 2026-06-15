import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function AccountSettingsScreen() {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  const handleComingSoon = () => {
    // Placeholder - all items disabled
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.comingSoonText}>Coming soon</Text>

        <View style={styles.settingsGroup}>
          <TouchableOpacity style={[styles.settingsRow, styles.disabledRow]} disabled={true}>
            <View style={styles.settingsInfo}>
              <Text style={styles.settingsTitle}>Payment methods</Text>
              <Text style={styles.settingsDescription}>Manage payment information</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingsRow, styles.disabledRow]} disabled={true}>
            <View style={styles.settingsInfo}>
              <Text style={styles.settingsTitle}>Login & credentials</Text>
              <Text style={styles.settingsDescription}>Change password and login details</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingsRow, styles.disabledRow]} disabled={true}>
            <View style={styles.settingsInfo}>
              <Text style={styles.settingsTitle}>Communication preferences</Text>
              <Text style={styles.settingsDescription}>Email and notification settings</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    textAlign: "center",
    marginBottom: 32,
  },
  settingsGroup: {
    gap: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  disabledRow: {
    opacity: 0.6,
  },
  settingsInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  settingsDescription: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
});
