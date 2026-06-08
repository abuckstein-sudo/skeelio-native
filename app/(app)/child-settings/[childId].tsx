import { SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import ChildSettingsForm from "@/lib/components/ChildSettingsForm";

export default function ChildSettingsScreen() {
  const router = useRouter();
  const { childId } = require("expo-router").useLocalSearchParams<{ childId: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ChildSettingsForm
        childId={childId}
        onSaved={() => {
          router.back();
        }}
        onDeleted={() => {
          router.push("/children");
        }}
      />
    </SafeAreaView>
  );
}
