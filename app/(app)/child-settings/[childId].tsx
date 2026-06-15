import { SafeAreaView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../_layout";
import ChildSettingsForm from "@/lib/components/ChildSettingsForm";

export default function ChildSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { childId, mode, fromOnboarding } = useLocalSearchParams<{ childId?: string; mode?: string; fromOnboarding?: string }>();

  const isAddMode = mode === "add";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ChildSettingsForm
        childId={childId}
        isAddMode={isAddMode}
        userId={session?.user?.id}
        onSaved={(result) => {
          if (mode === "add" && fromOnboarding === "1" && result?.childId) {
            router.push({
              pathname: "/(app)/assign",
              params: { childId: result.childId, childName: result.childName || "" },
            });
            return;
          }

          router.push("/children");
        }}
        onDeleted={() => {
          router.push("/children");
        }}
        onCancel={() => {
          router.back();
        }}
      />
    </SafeAreaView>
  );
}
